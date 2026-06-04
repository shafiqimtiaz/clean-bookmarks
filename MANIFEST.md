# Manifest

## Your bookmarks are yours

No account. No backend. No telemetry. The extension talks to the AI endpoint you point it at, and the only thing it sends is bookmark titles and URLs. If you never configure a key, the extension does nothing.

## Bring your own key

We will never sit between you and your model. There is no first-party API, no bundled account, no quota. You pick a provider from a long dropdown. If we disappear, the extension keeps working — there is no server to shut down.

## No silent access

The extension ships with no install-time host permissions. Chrome asks you to grant access to your provider's origin the first time the extension needs it. Origins you never use are never touched, and you can revoke any of them from `chrome://extensions` whenever you want.

## Reversible by default

Every change is preceded by a snapshot. One click and your bookmark tree is exactly the way it was — not "soft deleted," not "hidden," not in a graveyard. Reversibility is not a feature; it is the only acceptable way to touch a user's data.

## Plain tech, on purpose

TypeScript, Node.js, vanilla DOM, Chrome MV3, Zod. No framework, no 800 MB of transitive dependencies, no build pipeline sorcery. The whole extension should be readable in an afternoon and auditable by one person with a coffee. The cost of cleverness is paid by the next maintainer; we try not to bill them.

If that is also what you want, welcome.
