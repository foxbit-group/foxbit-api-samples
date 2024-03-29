﻿using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Newtonsoft.Json;

class Program
{
    private static readonly HttpClient client = new HttpClient();
    private static IConfiguration Configuration;
    private const string ApiBaseUrl = "https://api.foxbit.com.br";
    
    static async Task Main(string[] args)
    {
        var builder = new ConfigurationBuilder()
            .AddEnvironmentVariables();
        Configuration = builder.Build();

        Console.WriteLine("FOXBIT_API_KEY: " + Configuration["FOXBIT_API_KEY"]);

        try
        {
            // Get user info
            var meResponse = await RequestAsync("GET", "/rest/v3/me", null, null);
            Console.WriteLine("Response: " + meResponse);

            // Create an order
            var order = new
            {
                market_symbol = "btcbrl",
                side = "BUY",
                type = "LIMIT",
                price = "10.0",
                quantity = "0.0001",
            };
            var orderResponse = await RequestAsync("POST", "/rest/v3/orders", null, order);
            Console.WriteLine("Response: " + orderResponse);

            Thread.Sleep(2000);

            // Get active orders
            var orderParams = new
            {
                market_symbol = "btcbrl",
                state = "ACTIVE",
            };
            var ordersResponse = await RequestAsync("GET", "/rest/v3/orders", orderParams, null);
            Console.WriteLine("Response: " + ordersResponse);

            // Cancel the order
            var orderToCancel = new
            {
                type = "ID",
                id = JsonConvert.DeserializeObject<dynamic>(orderResponse).id
            };
            var cancelResponse = await RequestAsync("PUT", "/rest/v3/orders/cancel", null, orderToCancel);
            Console.WriteLine("Response: " + cancelResponse);
        }
        catch (Exception ex)
        {
            Console.WriteLine("Failed to process request: " + ex.Message);
        }
    }

    static string ConvertToQueryString(object paramsObj)
    {
        if (paramsObj == null) return string.Empty;

        var properties = paramsObj.GetType().GetProperties();
        var keyValuePairs = new List<string>();
        foreach (var property in properties)
        {
            var value = property.GetValue(paramsObj, null);
            if (value != null)
            {
                keyValuePairs.Add($"{WebUtility.UrlEncode(property.Name)}={WebUtility.UrlEncode(value.ToString())}");
            }
        }
        return string.Join("&", keyValuePairs);
    }

    static string Sign(string method, string path, string queryString, string body, string timestamp)
    {
        var preHash = $"{timestamp}{method}{path}{queryString}{body}";
        Console.WriteLine("PreHash: " + preHash);

        var secret = Configuration["FOXBIT_API_SECRET"];
        using (var hmac = new HMACSHA256(Encoding.ASCII.GetBytes(secret)))
        {
            var hash = hmac.ComputeHash(Encoding.ASCII.GetBytes(preHash));
            var signature = BitConverter.ToString(hash).Replace("-", "").ToLower();
            Console.WriteLine("Signature: " + signature);
            return signature;
        }
    }

    static async Task<string> RequestAsync(string method, string path, object paramsObj, object bodyObj)
    {
        Console.WriteLine("--------------------------------------------------");
        Console.WriteLine("Requesting: " + method + " " + path);

        var queryString = ConvertToQueryString(paramsObj);
        var body = bodyObj != null ? JsonConvert.SerializeObject(bodyObj) : string.Empty;
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
        var signature = Sign(method, path, queryString, body, timestamp);
        var requestUri = $"{ApiBaseUrl}{path}{(string.IsNullOrEmpty(queryString) ? "" : "?" + queryString)}";
        Console.WriteLine("Full URI: " + requestUri);

        var request = new HttpRequestMessage(new HttpMethod(method), requestUri)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };

        request.Headers.Add("X-FB-ACCESS-KEY", Configuration["FOXBIT_API_KEY"]);
        request.Headers.Add("X-FB-ACCESS-TIMESTAMP", timestamp);
        request.Headers.Add("X-FB-ACCESS-SIGNATURE", signature);

        var response = await client.SendAsync(request);
        var responseContent = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            Console.WriteLine($"HTTP Status Code: {response.StatusCode}, Error Response Body: {responseContent}");
            throw new HttpRequestException(responseContent);
        }

        return responseContent;
    }
}
