"""Minimal HTTP client so the rest of the backend doesn't care whether
`requests` is actually present in the arcgispro-py3 environment (see
docs/backend-architecture.md) - falls back to the standard library's
urllib if `requests` isn't installed.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

try:
    import requests
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False


def post_form(url, data):
    """POST url-encoded form data, return the parsed JSON response body."""
    if _HAS_REQUESTS:
        response = requests.post(url, data=data)
        response.raise_for_status()
        return response.json()

    encoded = urllib.parse.urlencode(data).encode("utf-8")
    request = urllib.request.Request(url, data=encoded, method="POST")
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def get_json(url, params=None, headers=None):
    """GET url (with optional query params/headers), return parsed JSON."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    if _HAS_REQUESTS:
        response = requests.get(url, headers=headers or {})
        response.raise_for_status()
        return response.json()

    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))
