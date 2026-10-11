export interface StatusCode {
  code: number;
  name: string;
  meaning: string;
}

export const STATUS_CODES: StatusCode[] = [
  { code: 100, name: 'Continue', meaning: 'The client should continue with its request.' },
  {
    code: 101,
    name: 'Switching Protocols',
    meaning: 'The server is switching protocols (e.g. WebSocket).',
  },
  {
    code: 103,
    name: 'Early Hints',
    meaning: 'Preliminary headers so the client can preload resources.',
  },
  { code: 200, name: 'OK', meaning: 'The request succeeded.' },
  { code: 201, name: 'Created', meaning: 'A new resource was created (see the Location header).' },
  { code: 202, name: 'Accepted', meaning: 'Accepted for processing, but not completed yet.' },
  { code: 204, name: 'No Content', meaning: 'Success with no response body.' },
  {
    code: 206,
    name: 'Partial Content',
    meaning: 'Only part of the resource is returned (Range request).',
  },
  { code: 301, name: 'Moved Permanently', meaning: 'The resource has a new permanent URL.' },
  { code: 302, name: 'Found', meaning: 'Temporary redirect; the method may change to GET.' },
  { code: 303, name: 'See Other', meaning: 'Fetch the result from another URL with GET.' },
  { code: 304, name: 'Not Modified', meaning: 'The cached version is still valid.' },
  {
    code: 307,
    name: 'Temporary Redirect',
    meaning: 'Temporary redirect that keeps the method and body.',
  },
  {
    code: 308,
    name: 'Permanent Redirect',
    meaning: 'Permanent redirect that keeps the method and body.',
  },
  { code: 400, name: 'Bad Request', meaning: 'The request is malformed or fails validation.' },
  { code: 401, name: 'Unauthorized', meaning: 'Authentication is missing or invalid.' },
  {
    code: 402,
    name: 'Payment Required',
    meaning: 'Reserved; used by some APIs for billing limits.',
  },
  { code: 403, name: 'Forbidden', meaning: 'Authenticated, but not allowed to do this.' },
  { code: 404, name: 'Not Found', meaning: 'The resource does not exist (or is hidden).' },
  {
    code: 405,
    name: 'Method Not Allowed',
    meaning: 'The HTTP method is not supported for this URL.',
  },
  { code: 406, name: 'Not Acceptable', meaning: 'No representation matches the Accept headers.' },
  { code: 408, name: 'Request Timeout', meaning: 'The server timed out waiting for the request.' },
  {
    code: 409,
    name: 'Conflict',
    meaning: 'The request conflicts with the current resource state.',
  },
  { code: 410, name: 'Gone', meaning: 'The resource was permanently removed.' },
  { code: 411, name: 'Length Required', meaning: 'A Content-Length header is required.' },
  { code: 412, name: 'Precondition Failed', meaning: 'An If-* precondition evaluated to false.' },
  {
    code: 413,
    name: 'Content Too Large',
    meaning: 'The request body is larger than the server accepts.',
  },
  { code: 414, name: 'URI Too Long', meaning: 'The URL is longer than the server accepts.' },
  { code: 415, name: 'Unsupported Media Type', meaning: 'The Content-Type is not supported.' },
  { code: 416, name: 'Range Not Satisfiable', meaning: 'The requested byte range is invalid.' },
  {
    code: 418,
    name: "I'm a teapot",
    meaning: 'An April Fools joke from RFC 2324; sometimes used for blocking.',
  },
  {
    code: 421,
    name: 'Misdirected Request',
    meaning: 'Sent to a server that cannot produce a response.',
  },
  {
    code: 422,
    name: 'Unprocessable Content',
    meaning: 'Well-formed, but semantically invalid (validation errors).',
  },
  { code: 423, name: 'Locked', meaning: 'The resource is locked (WebDAV).' },
  { code: 425, name: 'Too Early', meaning: 'The server will not risk replaying the request.' },
  { code: 426, name: 'Upgrade Required', meaning: 'The client must switch to another protocol.' },
  {
    code: 428,
    name: 'Precondition Required',
    meaning: 'The request must be conditional (If-Match).',
  },
  { code: 429, name: 'Too Many Requests', meaning: 'Rate limited; check Retry-After.' },
  { code: 431, name: 'Request Header Fields Too Large', meaning: 'Headers are too large.' },
  { code: 451, name: 'Unavailable For Legal Reasons', meaning: 'Blocked for legal reasons.' },
  { code: 500, name: 'Internal Server Error', meaning: 'An unexpected server error.' },
  {
    code: 501,
    name: 'Not Implemented',
    meaning: 'The server does not support this functionality.',
  },
  { code: 502, name: 'Bad Gateway', meaning: 'An upstream server returned an invalid response.' },
  {
    code: 503,
    name: 'Service Unavailable',
    meaning: 'Overloaded or down for maintenance; check Retry-After.',
  },
  { code: 504, name: 'Gateway Timeout', meaning: 'An upstream server did not respond in time.' },
  { code: 505, name: 'HTTP Version Not Supported', meaning: 'The HTTP version is not supported.' },
  {
    code: 507,
    name: 'Insufficient Storage',
    meaning: 'The server cannot store the representation (WebDAV).',
  },
  {
    code: 511,
    name: 'Network Authentication Required',
    meaning: 'Authenticate to gain network access (captive portal).',
  },
];

export function searchStatusCodes(query: string): StatusCode[] {
  const q = query.trim().toLowerCase();
  if (!q) return STATUS_CODES;
  return STATUS_CODES.filter(
    (s) =>
      String(s.code).startsWith(q) ||
      s.name.toLowerCase().includes(q) ||
      s.meaning.toLowerCase().includes(q) ||
      (q.length === 3 && q.endsWith('xx') && String(s.code).startsWith(q[0])),
  );
}
