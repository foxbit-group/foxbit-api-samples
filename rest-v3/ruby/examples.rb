require 'rubygems'
require 'bundler/setup'

Bundler.require(:default)

def sign(method, path, params, body)
  queryString = params.map { |key, value| "#{key}=#{URI.encode_www_form_component(value)}" }.join('&') if params
  rawBody = body.to_json if body

  timestamp = Time.now.to_i * 1000 # Convert to milliseconds
  preHash = "#{timestamp}#{method.upcase}#{path}#{queryString}#{rawBody}"
  puts 'PreHash:', preHash
  digest = OpenSSL::Digest.new('sha256')
  signature = OpenSSL::HMAC.hexdigest(digest, ENV['FOXBIT_API_SECRET'], preHash)
  puts 'Signature:', signature

  { signature: signature, timestamp: timestamp }
end

def request(method, path, params, body)
  puts '--------------------------------------------------'
  puts 'Requesting:', method, path
  sign_result = sign(method, path, params, body)
  url = "https://api.foxbit.com.br#{path}"
  headers = {
    'X-FB-ACCESS-KEY' => ENV['FOXBIT_API_KEY'],
    'X-FB-ACCESS-TIMESTAMP' => sign_result[:timestamp].to_s,
    'X-FB-ACCESS-SIGNATURE' => sign_result[:signature],
    'Content-Type' => 'application/json',
  }

  conn = Faraday.new(url: url, headers: headers)
  response = case method.downcase
             when 'get'
               conn.get { |req| req.params = params if params }
             when 'post'
               conn.post do |req|
                 req.body = body.to_json if body
               end
             when 'put'
               conn.put do |req|
                 req.body = body.to_json if body
               end
             end

  JSON.parse(response.body)
rescue Faraday::Error => e
  puts "Failed to process request: #{e.message}"
  raise
end

begin
  puts 'FOXBIT_API_KEY:', ENV['FOXBIT_API_KEY']

  # Get the user information
  me_response = request('GET', '/rest/v3/me', {}, nil)
  puts 'Response:', me_response

  # Request to create a new order
  order = {
    market_symbol: 'btcbrl',
    side: 'BUY',
    type: 'LIMIT',
    price: '10.0',
    quantity: '0.0001',
  }
  order_response = request('POST', '/rest/v3/orders', {}, order)
  puts 'Response:', order_response

  sleep 2

  # Get active orders
  orders_param = {
    market_symbol: 'btcbrl',
    state: 'ACTIVE',
  }
  orders_response = request('GET', '/rest/v3/orders', orders_param, nil)
  puts 'Response:', orders_response

  # Request to cancel the order
  order_to_cancel = { type: :ID, id: order_response['id'] }
  cancel_response = request('PUT', '/rest/v3/orders/cancel', {}, order_to_cancel)
  puts 'Response:', cancel_response
rescue => e
  puts "Failed to process request: #{e.message}"
end
