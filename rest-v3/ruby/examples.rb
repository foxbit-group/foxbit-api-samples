# frozen_string_literal: true

# Foxbit REST API v3 example — Ruby standard library only.
#
# Flow: fetch account info, read the public order book, place a LIMIT BUY
# order far below market price, list active orders and cancel the order.
#
# Docs: https://docs.foxbit.com.br/rest/v3/

require "net/http"
require "openssl"
require "json"
require "cgi"
require "uri"

API_BASE = "https://api.foxbit.com.br"
TIMEOUT_SECONDS = 30
# Limit price as a fraction of the best bid. The API rejects prices too far
# from the market (422, code 5005); the band width is not documented.
PRICE_FACTOR = 0.5

API_KEY = ENV.fetch("FOXBIT_API_KEY", "")
API_SECRET = ENV.fetch("FOXBIT_API_SECRET", "")

# Builds both representations of the query string from the same ordered params:
# - decoded: raw (unencoded) values, used in the signature prehash;
# - encoded: RFC 3986 percent-encoded (space => %20), used in the request URL.
def build_query(params)
  return ["", ""] if params.nil? || params.empty?

  decoded = params.map { |key, value| "#{key}=#{value}" }.join("&")
  encoded = params.map do |key, value|
    "#{CGI.escapeURIComponent(key.to_s)}=#{CGI.escapeURIComponent(value.to_s)}"
  end.join("&")
  [decoded, encoded]
end

# Signs a request with HMAC-SHA256 over:
#   timestamp + METHOD + path + decodedQuery + rawBody
#
# Gotcha 1: the query string enters the prehash with DECODED (raw) values,
# even though it is sent percent-encoded in the URL.
# Gotcha 2: rawBody must be the exact string sent on the wire — serialize
# the body once and sign those same bytes.
def sign(secret, method, path, decoded_query, raw_body, timestamp)
  prehash = "#{timestamp}#{method}#{path}#{decoded_query}#{raw_body}"
  signature = OpenSSL::HMAC.hexdigest("SHA256", secret, prehash)
  [prehash, signature]
end

# Performs an HTTP request, printing the prehash (when authenticated) and the
# response. Exits with a non-zero status on any non-2xx response.
def request(method, path, params: nil, body: nil, auth: true)
  decoded_query, encoded_query = build_query(params)
  raw_body = body.nil? ? "" : JSON.generate(body) # serialized exactly once

  uri = URI("#{API_BASE}#{path}")
  uri.query = encoded_query unless encoded_query.empty?

  puts "-" * 50
  puts "#{method} #{path}"

  headers = { "Content-Type" => "application/json" }
  if auth
    timestamp = (Time.now.to_f * 1000).to_i.to_s
    prehash, signature = sign(API_SECRET, method, path, decoded_query, raw_body, timestamp)
    puts "PreHash: #{prehash}"
    headers["X-FB-ACCESS-KEY"] = API_KEY
    headers["X-FB-ACCESS-TIMESTAMP"] = timestamp
    headers["X-FB-ACCESS-SIGNATURE"] = signature
  end

  request_class = { "GET" => Net::HTTP::Get, "POST" => Net::HTTP::Post, "PUT" => Net::HTTP::Put }.fetch(method)
  response = Net::HTTP.start(uri.host, uri.port, use_ssl: true,
                             open_timeout: TIMEOUT_SECONDS, read_timeout: TIMEOUT_SECONDS) do |http|
    req = request_class.new(uri, headers)
    req.body = raw_body unless raw_body.empty?
    http.request(req)
  end

  puts "Response (#{response.code}): #{response.body}"
  abort "Request failed: #{method} #{path} returned HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

  JSON.parse(response.body)
end

if API_KEY.empty? || API_SECRET.empty?
  abort "Error: set the FOXBIT_API_KEY and FOXBIT_API_SECRET environment variables."
end

# 1. Fetch account information (authenticated, no params).
request("GET", "/rest/v3/me")

# 2. Fetch the order book (public endpoint — no authentication headers).
orderbook = request("GET", "/rest/v3/markets/btcbrl/orderbook", params: { "depth" => "1" }, auth: false)
best_bid = orderbook["bids"][0][0] # best bid price, as a decimal string

# 3. Price the order at 50% of the best bid: within the accepted price band
# (absurd prices such as a hardcoded 10.0 are rejected with 422), yet far too
# low to ever execute. btcbrl has price_increment 1.0, so round to an integer.
price = (best_bid.to_f * PRICE_FACTOR).floor.to_s
puts "Best bid: #{best_bid} | Order price: #{price}"

# 4. Create a LIMIT BUY order.
order = request("POST", "/rest/v3/orders", body: {
  "market_symbol" => "btcbrl",
  "side" => "BUY",
  "type" => "LIMIT",
  "price" => price,
  "quantity" => "0.0001"
})
order_id = order.fetch("id")

# 5. Give the order a moment to show up in listings.
sleep 2

# 6. List active orders — the order created above should appear.
request("GET", "/rest/v3/orders", params: { "market_symbol" => "btcbrl", "state" => "ACTIVE" })

# 7. Cancel the order by id.
request("PUT", "/rest/v3/orders/cancel", body: { "type" => "ID", "id" => order_id })

puts "-" * 50
puts "Done: order #{order_id} was created, listed and cancelled."
