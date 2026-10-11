import { describe, expect, it } from 'vitest';
import { camelCase, generateTypedCSharp } from '@/features/http/generators/csharpClient';
import type { HttpRequestSpec } from '@/features/http/types';

const req = (o: Partial<HttpRequestSpec> = {}): HttpRequestSpec => ({
  method: 'POST',
  url: 'https://api.example.com/orders',
  headers: [
    { name: 'Authorization', value: 'Bearer ***' },
    { name: 'Content-Type', value: 'application/json' },
    { name: 'X-Correlation-ID', value: 'abc123' },
  ],
  body: '{"productId":123,"quantity":2}',
  ...o,
});

const RESPONSE = JSON.stringify({
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  status: 'created',
  total: 19.99,
  createdAt: '2026-10-02T10:00:00Z',
  items: [{ sku: 'A1', qty: 2 }],
});

const gen = (r: HttpRequestSpec, resp = '') => {
  const out = generateTypedCSharp(r, resp);
  if (!out.ok) throw new Error(out.error.message);
  return Object.fromEntries(out.value.map((s) => [s.title, s.code]));
};

describe('generateTypedCSharp', () => {
  it('generates request and response records', () => {
    const { 'Models (input / output)': models } = gen(req(), RESPONSE);
    expect(models).toContain(
      'public sealed record OrdersRequest(\n    int ProductId,\n    int Quantity);',
    );
    expect(models).toContain('Guid Id');
    expect(models).toContain('string Status');
    expect(models).toContain('double Total');
    expect(models).toContain('DateTimeOffset CreatedAt');
    expect(models).toContain('List<Item> Items');
    expect(models).toContain('public sealed record Item(\n    string Sku,\n    int Qty);');
    expect(models).not.toContain('JsonPropertyName');
  });

  it('generates a typed client with auth, headers and JSON content', () => {
    const { 'API client': client } = gen(req(), RESPONSE);
    expect(client).toContain('public sealed class OrdersClient(HttpClient http)');
    expect(client).toContain('public async Task<OrdersResponse?> PostOrdersAsync(');
    expect(client).toContain('OrdersRequest request,');
    expect(client).toContain('string accessToken,');
    expect(client).toContain('new AuthenticationHeaderValue("Bearer", accessToken)');
    expect(client).toContain('TryAddWithoutValidation("X-Correlation-ID", "abc123")');
    expect(client).toContain('JsonContent.Create(request)');
    expect(client).toContain('ReadFromJsonAsync<OrdersResponse>(cancellationToken)');
  });

  it('generates a usage example that builds the request', () => {
    const { 'Usage example': usage } = gen(req(), RESPONSE);
    expect(usage).toContain('var client = new OrdersClient(http);');
    expect(usage).toContain('new OrdersRequest(ProductId: 123, Quantity: 2)');
    expect(usage).toContain('accessToken: "***"');
    expect(usage).toContain('await client.PostOrdersAsync(');
  });

  it('adds JsonPropertyName when the JSON key is not the camelCase of the property', () => {
    const { 'Models (input / output)': models } = gen(req({ body: '{"product_id":1}' }));
    expect(models).toContain('using System.Text.Json.Serialization;');
    expect(models).toContain('[property: JsonPropertyName("product_id")] int ProductId');
  });

  it('returns the raw string when no sample response is given', () => {
    const { 'API client': client } = gen(req());
    expect(client).toContain('Task<string> PostOrdersAsync(');
    expect(client).toContain('ReadAsStringAsync(cancellationToken)');
  });

  it('omits the request parameter and models for GET without a sample', () => {
    const sections = gen(req({ method: 'GET', body: '', headers: [] }));
    expect(sections['Models (input / output)']).toBeUndefined();
    expect(sections['API client']).toContain('GetOrdersAsync(\n        CancellationToken');
    expect(sections['Usage example']).toContain('await client.GetOrdersAsync()');
  });

  it('marks null and optional values as nullable and merges array items', () => {
    const { 'Models (input / output)': models } = gen(
      req({ method: 'GET', body: '' }),
      '{"note":null,"rows":[{"a":1,"b":"x"},{"a":2}]}',
    );
    expect(models).toContain('object? Note');
    expect(models).toContain('string? B');
    expect(models).toContain('List<Row> Rows');
  });

  it('uses long, bool and nested records', () => {
    const { 'Models (input / output)': models } = gen(
      req({ body: '{"big":3000000000,"ok":true,"address":{"city":"Berlin"}}' }),
    );
    expect(models).toContain('long Big');
    expect(models).toContain('bool Ok');
    expect(models).toContain('Address Address');
    expect(models).toContain('public sealed record Address(\n    string City);');
  });

  it('supports a top-level JSON array body', () => {
    const { 'Models (input / output)': models, 'API client': client } = gen(
      req({ body: '[{"id":1}]' }),
    );
    expect(models).toContain('public sealed record OrdersRequestItem(');
    expect(client).toContain('List<OrdersRequestItem> request,');
  });

  it('falls back to StringContent for non-JSON bodies', () => {
    const { 'API client': client, 'Usage example': usage } = gen(
      req({
        body: 'a=1&b=2',
        headers: [{ name: 'Content-Type', value: 'application/x-www-form-urlencoded' }],
      }),
    );
    expect(client).toContain('string body,');
    expect(client).toContain(
      'new StringContent(body, Encoding.UTF8, "application/x-www-form-urlencoded")',
    );
    expect(usage).toContain('"a=1&b=2"');
  });

  it('derives names from the last meaningful path segment', () => {
    const { 'API client': client } = gen(req({ url: 'https://x.io/v1/users/42?x=1' }));
    expect(client).toContain('class UsersClient');
  });

  it('reports an invalid sample response', () => {
    const r = generateTypedCSharp(req(), '{oops');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.title).toContain('Sample response');
  });
});

describe('camelCase', () => {
  it.each([
    ['ProductId', 'productId'],
    ['ID', 'id'],
    ['URLPath', 'urlPath'],
    ['Id', 'id'],
    ['already', 'already'],
  ])('%s -> %s', (input, expected) => {
    expect(camelCase(input)).toBe(expected);
  });
});
