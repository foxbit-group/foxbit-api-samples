// Foxbit REST API v3 example (Go, standard library only).
//
// Flow: fetch account info, read the public order book, place a LIMIT BUY
// order far below market, list active orders, then cancel the order.
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const baseURL = "https://api.foxbit.com.br"

// Limit price as a fraction of the best bid. The API rejects prices too far
// from the market (422, code 5005); the band width is not documented.
const priceFactor = 0.5

// Never use http.DefaultClient for real calls: it has no timeout.
var httpClient = &http.Client{Timeout: 30 * time.Second}

// param is one query-string key/value pair. Params are kept in a slice
// because Go maps have no defined order, and the query in the signed prehash
// must list pairs in the exact order they appear in the request URL.
type param struct {
	key, value string
}

// orderRequest is the body of POST /rest/v3/orders.
type orderRequest struct {
	MarketSymbol string `json:"market_symbol"`
	Side         string `json:"side"`
	Type         string `json:"type"`
	Price        string `json:"price"`
	Quantity     string `json:"quantity"`
}

// cancelRequest is the body of PUT /rest/v3/orders/cancel.
type cancelRequest struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// encodeComponent percent-encodes a query component per RFC 3986:
// space becomes %20 (never +) and everything outside A-Za-z0-9-._~ is escaped.
func encodeComponent(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}

// buildQueryStrings renders the same ordered params twice: decoded (raw
// values, used only in the signature prehash) and percent-encoded (used in
// the request URL). Building both from one structure keeps them in sync.
func buildQueryStrings(params []param) (decoded, encoded string) {
	decodedPairs := make([]string, 0, len(params))
	encodedPairs := make([]string, 0, len(params))
	for _, p := range params {
		decodedPairs = append(decodedPairs, p.key+"="+p.value)
		encodedPairs = append(encodedPairs, encodeComponent(p.key)+"="+encodeComponent(p.value))
	}
	return strings.Join(decodedPairs, "&"), strings.Join(encodedPairs, "&")
}

// sign returns the lowercase-hex HMAC-SHA256 of the prehash string
// timestamp + method + path + decodedQuery + rawBody.
//
// Signing gotchas:
//  1. The query string goes into the prehash DECODED (raw values), even
//     though the URL sends it percent-encoded.
//  2. rawBody must be byte-for-byte the body sent on the wire, so the body
//     is serialized exactly once and the same string is signed and sent.
func sign(secret, timestamp, method, path, decodedQuery, rawBody string) string {
	preHash := timestamp + method + path + decodedQuery + rawBody
	fmt.Println("PreHash:", preHash)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(preHash))
	return hex.EncodeToString(mac.Sum(nil))
}

// request sends one API call and returns the response body. body may be nil;
// it is JSON-serialized exactly once, and that same string is both signed and
// sent. Public endpoints are called with authenticated=false (no signature).
func request(method, path string, params []param, body any, authenticated bool) ([]byte, error) {
	decodedQuery, encodedQuery := buildQueryStrings(params)

	rawBody := ""
	if body != nil {
		encoded, err := json.Marshal(body) // the single Marshal: signed and sent as-is
		if err != nil {
			return nil, fmt.Errorf("encoding request body: %w", err)
		}
		rawBody = string(encoded)
	}

	fullURL := baseURL + path
	if encodedQuery != "" {
		fullURL += "?" + encodedQuery
	}

	fmt.Println("--------------------------------------------------")
	fmt.Println(method, path)

	var bodyReader io.Reader
	if rawBody != "" {
		bodyReader = strings.NewReader(rawBody)
	}
	req, err := http.NewRequest(method, fullURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	if authenticated {
		timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
		signature := sign(os.Getenv("FOXBIT_API_SECRET"), timestamp, method, path, decodedQuery, rawBody)
		req.Header.Set("X-FB-ACCESS-KEY", os.Getenv("FOXBIT_API_KEY"))
		req.Header.Set("X-FB-ACCESS-TIMESTAMP", timestamp)
		req.Header.Set("X-FB-ACCESS-SIGNATURE", signature)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sending request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading response body: %w", err)
	}

	fmt.Printf("Response (%d): %s\n", resp.StatusCode, respBody)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, respBody)
	}
	return respBody, nil
}

func run() error {
	// Fail fast (before any request) if credentials are missing.
	if os.Getenv("FOXBIT_API_KEY") == "" || os.Getenv("FOXBIT_API_SECRET") == "" {
		return errors.New("FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables must be set")
	}

	// Step 1: fetch account information (authenticated, no params).
	if _, err := request("GET", "/rest/v3/me", nil, nil, true); err != nil {
		return err
	}

	// Step 2: fetch the order book (public endpoint, no authentication).
	bookResp, err := request("GET", "/rest/v3/markets/btcbrl/orderbook", []param{{"depth", "1"}}, nil, false)
	if err != nil {
		return err
	}
	var book struct {
		Bids [][]string `json:"bids"` // [price, quantity] pairs as decimal strings
	}
	if err := json.Unmarshal(bookResp, &book); err != nil {
		return fmt.Errorf("parsing order book response: %w", err)
	}
	if len(book.Bids) == 0 || len(book.Bids[0]) == 0 {
		return errors.New("order book has no bids")
	}
	bestBid, err := strconv.ParseFloat(book.Bids[0][0], 64)
	if err != nil {
		return fmt.Errorf("parsing best bid %q: %w", book.Bids[0][0], err)
	}

	// Step 3: price the order at 50% of the best bid. That keeps it inside
	// the exchange's accepted price band (an absurd price like 10.0 is
	// rejected with HTTP 422) while staying far too low to ever execute.
	// btcbrl has price_increment 1.0, so the price is an integer string.
	price := strconv.FormatFloat(math.Floor(bestBid*priceFactor), 'f', 0, 64)
	fmt.Printf("Best bid: %s -> order price: %s\n", book.Bids[0][0], price)

	// Step 4: create the limit buy order (authenticated, JSON body).
	orderResp, err := request("POST", "/rest/v3/orders", nil, orderRequest{
		MarketSymbol: "btcbrl",
		Side:         "BUY",
		Type:         "LIMIT",
		Price:        price,
		Quantity:     "0.0001",
	}, true)
	if err != nil {
		return err
	}
	var order struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(orderResp, &order); err != nil {
		return fmt.Errorf("parsing create-order response: %w", err)
	}
	if order.ID == "" {
		return errors.New("create-order response has no id")
	}

	// Step 5: give the exchange a moment to register the order.
	time.Sleep(2 * time.Second)

	// Step 6: list active orders (authenticated, with query params).
	params := []param{{"market_symbol", "btcbrl"}, {"state", "ACTIVE"}}
	if _, err := request("GET", "/rest/v3/orders", params, nil, true); err != nil {
		return err
	}

	// Step 7: cancel the order created in step 4.
	if _, err := request("PUT", "/rest/v3/orders/cancel", nil, cancelRequest{Type: "ID", ID: order.ID}, true); err != nil {
		return err
	}

	fmt.Println("--------------------------------------------------")
	fmt.Println("Done: order", order.ID, "was created and cancelled.")
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(1)
	}
}
