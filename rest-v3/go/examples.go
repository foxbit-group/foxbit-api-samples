package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"
)

const apiBaseUrl = "https://api.foxbit.com.br"

func sign(method, path string, params map[string]string, body map[string]interface{}) (string, string) {
	var queryString string
	if params != nil {
		queryValues := url.Values{}
		for key, value := range params {
			queryValues.Add(key, value)
		}
		queryString = queryValues.Encode()
	}

	var rawBody []byte
	var err error
	if body != nil {
		rawBody, err = json.Marshal(body)
		if err != nil {
			log.Fatal("Error encoding body to JSON:", err)
		}
	}

	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	preHash := timestamp + method + path + queryString + string(rawBody)
	fmt.Println("PreHash:", preHash)

	h := hmac.New(sha256.New, []byte(os.Getenv("FOXBIT_API_SECRET")))
	h.Write([]byte(preHash))
	signature := hex.EncodeToString(h.Sum(nil))
	fmt.Println("Signature:", signature)

	return signature, timestamp
}

func request(method, path string, params map[string]string, body map[string]interface{}) ([]byte, error) {
	fmt.Println("--------------------------------------------------")
	fmt.Println("Requesting:", method, path)
	signature, timestamp := sign(method, path, params, body)
	url := apiBaseUrl + path

	client := &http.Client{}
	var req *http.Request
	var err error

	if body != nil {
		jsonBody, _ := json.Marshal(body)
		req, err = http.NewRequest(method, url, bytes.NewBuffer(jsonBody))
	} else {
		req, err = http.NewRequest(method, url, nil)
	}

	if err != nil {
		log.Fatal("Error creating request:", err)
	}

	q := req.URL.Query()
	for key, value := range params {
		q.Add(key, value)
	}
	req.URL.RawQuery = q.Encode()

	req.Header.Add("X-FB-ACCESS-KEY", os.Getenv("FOXBIT_API_KEY"))
	req.Header.Add("X-FB-ACCESS-TIMESTAMP", timestamp)
	req.Header.Add("X-FB-ACCESS-SIGNATURE", signature)
	req.Header.Add("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Fatal("Error on request:", err)
	}
	defer resp.Body.Close()

	bodyResp, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		log.Fatal("Error reading response body:", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		fmt.Printf("HTTP Status Code: %d, Error Response Body: %s\n", resp.StatusCode, bodyResp)
		return nil, fmt.Errorf("request failed with status code %d", resp.StatusCode)
	}

	return bodyResp, nil
}

func createOrder(marketSymbol, side, orderType, price, quantity string) ([]byte, error) {
	order := map[string]interface{}{
		"market_symbol": marketSymbol,
		"side":          side,
		"type":          orderType,
		"price":         price,
		"quantity":      quantity,
	}
	response, err := request("POST", "/rest/v3/orders", nil, order)
	if err != nil {
		return nil, err
	}
	return response, nil
}

func cancelOrder(orderID string) ([]byte, error) {
	orderToCancel := map[string]interface{}{
		"type": "ID",
		"id":   orderID,
	}
	response, err := request("PUT", "/rest/v3/orders/cancel", nil, orderToCancel)
	if err != nil {
		return nil, err
	}
	return response, nil
}

func main() {
	// Get user information
	mePath := "/rest/v3/me"
	meResponse, err := request("GET", mePath, nil, nil)
	if err != nil {
		log.Fatal("Failed to get user information:", err)
	}
	fmt.Println("Response:", string(meResponse))

	// Create an order
	orderResponse, err := createOrder("btcbrl", "BUY", "LIMIT", "10.0", "0.0001")
	if err != nil {
		log.Fatal("Failed to create order:", err)
	}
	fmt.Println("Order Response:", string(orderResponse))

	// Get order information
	var orderData map[string]interface{}
	err = json.Unmarshal(orderResponse, &orderData)
	if err != nil {
		log.Fatal("Failed to parse order response:", err)
	}

	// Cancel an order
	orderID := orderData["id"].(string)
	cancelResponse, err := cancelOrder(orderID)
	if err != nil {
		log.Fatal("Failed to cancel order:", err)
	}
	fmt.Println("Cancel Response:", string(cancelResponse))
}
