export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface HttpHeader {
  name: string;
  value: string;
}

/** One field of a multipart/form-data body. `file` fields carry a local file path. */
export interface MultipartField {
  name: string;
  value: string;
  file?: boolean;
}

export interface HttpRequestSpec {
  method: HttpMethod;
  url: string;
  headers: HttpHeader[];
  body: string;
  /** When present, the body is multipart/form-data and `body` is ignored. */
  multipart?: MultipartField[];
}

export const hasRequestBody = (req: HttpRequestSpec): boolean =>
  req.method !== 'GET' &&
  req.method !== 'HEAD' &&
  (req.body.length > 0 || (req.multipart?.length ?? 0) > 0);
