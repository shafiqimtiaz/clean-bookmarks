# Privacy Policy for Clean Bookmarks

Last updated: 2026-06-04

## What this extension does

Clean Bookmarks organizes your existing Chrome bookmarks into folders using AI.
It reads your bookmark tree, asks an LLM to suggest a folder structure, and writes
the result back. You bring your own API key for the LLM provider of your choice.

## Data the extension accesses

- **Bookmarks**: titles and URLs of bookmarks and folders already saved in Chrome.
  Required for organization. Read on demand; written back after AI categorization.
- **chrome.storage**: your selected LLM provider, model, API key, folder exclusions,
  and categorization preferences. Stored locally in your browser profile.

## Data the extension does NOT access

- Browsing history, open tabs, page content, form input, or any data outside the
  bookmark tree.
- Cookies, credentials, autofill, or any authentication material.
- Location, device identifiers, or any telemetry about your usage of the extension.

## Where your data goes

- All processing happens in your browser. The extension has no backend, no telemetry,
  and no analytics.
- When AI categorization runs, bookmark titles and URLs are sent **only** to the
  LLM provider you have configured, **only** over HTTPS, **using your own API key**.
  Each request is a direct browser-to-provider call.
- The developer of Clean Bookmarks has no access to your bookmarks, your API key,
  your prompt contents, or your provider responses.

## Your API key

Your API key is stored locally in chrome.storage and used solely to authenticate
requests you initiate. It is never transmitted to the developer or to any endpoint
other than the LLM provider you selected.

## Your controls

- Disable or uninstall the extension at any time. Disabling stops all API calls.
- Clear the extension's stored data from chrome://extensions → Clean Bookmarks → Storage.
- Revoke the API key at your provider. The extension will stop working on the next
  run.

## Changes to this policy

Material changes will be reflected here with an updated date and announced in the
extension's release notes.

## Contact

github.com/shafiq-imtiaz/clean-bookmarks/issues
