import type { Severity } from './types';

interface ErrorEntry {
  severity: Severity;
  title: string;
  detail: string;
  action: string | null;
}

export const ERROR_MAP: Record<string, ErrorEntry> = {
  ERR_NAME_NOT_RESOLVED: {
    severity: 'critical',
    title: 'Website address not found',
    detail: "The domain couldn't be resolved. DNS failure or site no longer exists.",
    action: 'Check your internet connection.',
  },
  ERR_CONNECTION_TIMED_OUT: {
    severity: 'high',
    title: 'Connection timed out',
    detail: 'The website took too long to respond.',
    action: 'Check your connection or try again later.',
  },
  ERR_TIMED_OUT: {
    severity: 'high',
    title: 'Request timed out',
    detail: 'The server stopped responding before the transfer completed.',
    action: 'Check your connection or try again later.',
  },
  ERR_CONNECTION_REFUSED: {
    severity: 'high',
    title: 'Connection refused',
    detail: 'The server is not accepting connections.',
    action: 'The site may be down. Try again later.',
  },
  ERR_CONNECTION_CLOSED: {
    severity: 'medium',
    title: 'Connection was cut off',
    detail: 'The server closed the connection before finishing.',
    action: 'Refresh. If recurring, the site may be overloaded.',
  },
  ERR_NETWORK_IO_SUSPENDED: {
    severity: 'medium',
    title: 'Connection was paused',
    detail: 'Network I/O was suspended (device sleep or tab freeze).',
    action: 'Refresh the page.',
  },
  ERR_SSL_PROTOCOL_ERROR: {
    severity: 'high',
    title: 'Security certificate problem',
    detail: "The site's TLS certificate has an error.",
    action: 'Do not enter sensitive information on this page.',
  },
  ERR_SSL_VERSION_OR_CIPHER_MISMATCH: {
    severity: 'high',
    title: 'Incompatible security protocol',
    detail: "The site's security settings are not compatible with your browser.",
    action: 'The site may need to update its security configuration.',
  },
  ERR_CERT_AUTHORITY_INVALID: {
    severity: 'high',
    title: 'Untrusted certificate',
    detail: "The site's SSL certificate is not trusted.",
    action: 'Do not enter sensitive information on this page.',
  },
  ERR_BLOCKED_BY_CLIENT: {
    severity: 'low',
    title: 'Request blocked by extension',
    detail: 'An ad blocker or privacy extension blocked a request.',
    action: null,
  },
  ERR_BLOCKED_BY_RESPONSE: {
    severity: 'medium',
    title: 'Response blocked by security policy',
    detail: "The browser blocked the response due to the site's security headers.",
    action: null,
  },
  ERR_ABORTED: {
    severity: 'low',
    title: 'Request cancelled',
    detail: 'The request was cancelled (navigation or user action).',
    action: null,
  },
  ERR_FAILED: {
    severity: 'medium',
    title: 'Request failed',
    detail: 'A generic network failure occurred.',
    action: 'Refresh the page.',
  },
  ERR_QUIC_PROTOCOL_ERROR: {
    severity: 'high',
    title: 'Connection protocol error (QUIC)',
    detail: 'The HTTP/3 (QUIC) connection encountered a protocol error.',
    action: 'Refresh. If it persists, try disabling QUIC via chrome://flags.',
  },
  ERR_HTTP2_PROTOCOL_ERROR: {
    severity: 'high',
    title: 'Connection protocol error (HTTP/2)',
    detail: 'The HTTP/2 connection encountered a protocol error.',
    action: 'Refresh the page.',
  },
};
