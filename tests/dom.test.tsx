// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { xmlToJson } from '@/features/json/utils/xml';
import { JsonViewer } from '@/features/json/components/JsonViewer';
import { JsonDiff } from '@/features/diff/components/JsonDiff';
import { Tools } from '@/features/encoding/components/Tools';
import { HttpTools } from '@/features/http/components/HttpTools';
import { JwtDecoder } from '@/features/jwt/components/JwtDecoder';
import { utf8ToBase64Url } from '@/lib/base64';

afterEach(cleanup);

const change = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('xmlToJson', () => {
  it('converts elements, attributes, repeated nodes and text', () => {
    const r = xmlToJson('<a id="1"><b>x</b><b>y</b><c><d>5</d></c>text</a>');
    expect(r.ok && r.value).toEqual({
      a: { '@id': '1', b: ['x', 'y'], c: { d: '5' }, '#text': 'text' },
    });
  });
  it('reports malformed XML and empty input', () => {
    const bad = xmlToJson('<a><b></a>');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.title).toBe('Invalid XML');
    expect(xmlToJson(' ').ok).toBe(false);
  });
});

describe('JSON converter UI', () => {
  it('converts to the selected target', async () => {
    render(<JsonViewer />);
    change('JSON', '{"id":1,"name":"a"}');
    fireEvent.click(screen.getByRole('tab', { name: 'Convert' }));
    fireEvent.change(screen.getByLabelText('Convert to'), { target: { value: 'yaml' } });
    await waitFor(() => expect(document.body.textContent).toContain('id: 1'));
    fireEvent.change(screen.getByLabelText('Convert to'), { target: { value: 'go' } });
    await waitFor(() => expect(document.body.textContent).toContain('type Root struct'));
  });

  it('turns XML into JSON on request', () => {
    render(<JsonViewer />);
    const box = screen.getByLabelText('JSON') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '<a><b>1</b></a>' } });
    fireEvent.click(screen.getByRole('button', { name: 'XML → JSON' }));
    expect(JSON.parse(box.value)).toEqual({ a: { b: '1' } });
  });
});

describe('JWT verify UI', () => {
  it('creates a token, opens it in the decoder and verifies the signature', async () => {
    render(<JwtDecoder />);
    fireEvent.click(screen.getByRole('tab', { name: /Create test token/ }));
    change('Signing secret', 's3cret');
    fireEvent.click(screen.getByRole('button', { name: 'Sign token' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open in decoder' }));
    expect(await screen.findByText('Verify signature')).toBeInTheDocument();
    change('Shared secret', 's3cret');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Signature valid')).toBeInTheDocument();
    change('Shared secret', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Signature invalid')).toBeInTheDocument();
  });

  it('opens a seeded token immediately', () => {
    const token = `${utf8ToBase64Url('{"alg":"none"}')}.${utf8ToBase64Url('{"sub":"1"}')}.`;
    render(<JwtDecoder seed={token} />);
    expect(screen.getByText('Security review')).toBeInTheDocument();
    expect(screen.getByText(/unsigned and can be forged/)).toBeInTheDocument();
  });
});

describe('Diff UI', () => {
  it('hides ignored paths', () => {
    render(<JsonDiff />);
    change('Original JSON', '{"a":1,"updatedAt":1}');
    change('New JSON', '{"a":2,"updatedAt":2}');
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    expect(screen.getByText('updatedAt')).toBeInTheDocument();
    change('Ignore paths', 'updatedAt');
    expect(screen.queryByText('updatedAt')).not.toBeInTheDocument();
    expect(screen.getByText(/1 difference hidden/)).toBeInTheDocument();
  });
});

describe('HTTP UI', () => {
  it('builds multipart and GraphQL requests', () => {
    render(<HttpTools />);
    change('URL', 'https://api.example.com/upload');
    fireEvent.change(screen.getByLabelText('HTTP method'), { target: { value: 'POST' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Multipart' }));
    change('Part 1 name', 'title');
    change('Part 1 value', 'hello');
    fireEvent.click(screen.getByRole('button', { name: 'Generate cURL' }));
    expect(document.body.textContent).toContain("-F 'title=hello'");

    fireEvent.click(screen.getByRole('tab', { name: 'GraphQL' }));
    change('Query / mutation', '{ me { id } }');
    fireEvent.click(screen.getByRole('button', { name: 'Generate JavaScript' }));
    expect(document.body.textContent).toContain('"query"');
  });

  it('shows typed C# models and client sections', () => {
    render(<HttpTools />);
    change('URL', 'https://api.example.com/orders');
    fireEvent.change(screen.getByLabelText('HTTP method'), { target: { value: 'POST' } });
    change('Body', '{"productId":1}');
    change(/Sample response/, '{"id":"7c9e6679-7425-40de-944b-e07fc1f90ae7"}');
    fireEvent.click(screen.getByRole('button', { name: 'Generate C# models' }));
    expect(screen.getByText('Models (input / output)')).toBeInTheDocument();
    expect(screen.getByText('API client')).toBeInTheDocument();
    expect(screen.getByText('Usage example')).toBeInTheDocument();
  });

  it('imports a raw HTTP request', () => {
    render(<HttpTools />);
    fireEvent.click(screen.getByText('Import request'));
    fireEvent.click(screen.getByRole('tab', { name: 'Raw HTTP' }));
    change('Raw HTTP request', 'GET /x HTTP/1.1\nHost: api.example.com\nAccept: */*');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect((screen.getByLabelText('URL') as HTMLInputElement).value).toBe(
      'https://api.example.com/x',
    );
  });
});

describe('Tools UI', () => {
  it('opens the sub-tool chosen by the context menu', () => {
    render(<Tools seed="aGVsbG8=" sub="base64" />);
    expect((screen.getByLabelText('Base64 input') as HTMLTextAreaElement).value).toBe('aGVsbG8=');
    fireEvent.click(screen.getByRole('button', { name: 'Decode' }));
    expect((screen.getByLabelText('Output') as HTMLTextAreaElement).value).toBe('hello');
  });

  it('filters status codes and tests regular expressions', () => {
    render(<Tools />);
    fireEvent.click(screen.getByRole('tab', { name: 'Status codes' }));
    change('Search status codes', '429');
    expect(screen.getByText('Too Many Requests')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Regex' }));
    change('Pattern', '\\d+');
    change('Sample text', 'a1 b22');
    expect(screen.getByText('2 matches')).toBeInTheDocument();
  });
});
