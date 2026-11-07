# District Deck V4 hosting preparation

This is a development review build. No public service has been deployed. The independent visual, frame pacing and complete release gates remain in progress.

The browser game and authoritative city rooms run together in one Node process. Node 22.13 or later is required. The server uses Node modules and the same vendored Three.js math as the browser; the exporter supplies its Node binding, so the release needs no npm install. It serves only the five player pages, runtime code, assets, vendored libraries and licence files. Server code, room data, repository history, art targets and QA material are not public routes.

From the repository checkout only (not an exported directory):

```sh
npm run mvp:production
```

The default address is `http://127.0.0.1:4321`. Override `PORT` if another review is running. `HOST` defaults to loopback. `DD_DATA_DIR` selects the private room storage directory; the default is `.district-deck-rooms` beside `mvp`. Keep it on internal durable storage outside the public file tree, and back it up with the server stopped. One process must own a data directory. Do not put live room data on ExFAT or ephemeral hosting storage.

From that checkout, create a verified, separate release directory:

```sh
npm run mvp:release -- /absolute/path/to/new-release-directory
```

The exporter refuses an existing output directory and copies a fixed runtime allowlist. It includes licence/provenance files already in the asset tree and records each copied file’s byte count and SHA-256. It does not copy dependencies, test captures, session data, source Git history or saved rooms. Keep the manifest with the release. The private companions `README.md`, [M16-ASSET-DISTRIBUTION.md](M16-ASSET-DISTRIBUTION.md) and [M16-ASSET-PROVENANCE.json](M16-ASSET-PROVENANCE.json) are also copied exactly and included in its hashes. They are operator files, not public static routes; they preserve unresolved account, task and input-permission fields rather than granting new rights.

Start an exported release on a host:

```sh
HOST=0.0.0.0 PORT=4321 DD_DATA_DIR=/data/district-deck/rooms DD_ORIGIN=https://your-game.example node server/start.mjs
```

Place an HTTPS reverse proxy in front of this process and route both the site and `/api/rooms` to it. The example domain `https://your-game.example` is a placeholder: replace it with the actual HTTPS origin in `DD_ORIGIN`. Set `DD_DATA_DIR` to your actual durable private path. The exporter prints the same placeholder requirement; it does not configure hosting. Keep the data directory on a persistent volume. `/healthz` reports readiness. SIGTERM stops new connections and waits for admitted room writes. This release does not support multiple server replicas sharing one directory.

Rooms are invitation-only, with a default bound of 32 stored rooms (`DD_MAX_ROOMS`). Every gameplay mutation has a request ID, version, revision, quarter and starting-state hash. A network retry uses the exact same request body and ID. An invalid or stale plan is rejected without changing state. Seat tokens grant access to that seat and must stay private. No access tokens appear in query strings or routine server logs.

New human and external-AI rooms use seat auction contract 2 and durable envelope format 3. Only the two actual players' submitted maxima compete; the quarter's recorded seat order breaks exact ties. Bids stay private until settlement, and a redacted browser view cannot forecast the winner. Existing format-1/2 rooms remain readable. An authenticated player can explicitly enable seat auctions from View plan at an empty quarter, with no accepted plans, commits, pacts or unresolved auction commitments. The server records the transition and preserves previous cash, holdings, financial receipts and request history.

Back up room data with the server stopped **before** running a newer release. Older format-1/2 servers reject format 3; restoring an old executable requires its compatible saved data as well. A legacy room already containing an unsafe accepted scheduled bid is preserved but cannot advance on this server. There is no automatic repair or plan reset for that case. New bidding is disabled in legacy remote rooms until a safe explicit upgrade. Built-in-policy and solo auctions retain their historical rules.

Browser access is through **Online play** on the landing page. A host chooses an invited human, an external AI or a built-in policy opponent. The client remembers room access in the current tab, separate from solo saves. The lobby exposes an explicit token for moving to another device. The in-game plan shows staged moves and commits; active pacts require an honour/defect decision. The AI protocol is documented at `credits.html#online-api` and current versions/options at `/api/rooms/options`.

Current scope: authoritative city planning, server-validated Cybercab financial inputs, shared quarter resolution and private completed-quarter financial receipts. Books and View plan show the authenticated seat's recorded cash, income, NAV and Cybercab totals; detailed action outcomes remain outside this compact history. Old format-1 rooms can recover only their latest supported receipt, with earlier missing history disclosed. World transfers, client-scored arcade rewards, public matchmaking and ranked leaderboards are outside the current room protocol. Room opening uses a saved private recovery proof: exact retries after a lost create/join response recover the same seat, including after server restart.

The seat auction contract stays inside authoritative rooms. It is not an offline save or correspondence-packet interchange format. An external agent can enable a compatible legacy room by POSTing to `/api/rooms/ROOM_ID/auction-contract` with the usual identity and request fields; the server derives and records the transition. Use the `auctionContract` snapshot field to read the version and any legacy settlement hold, then refresh the snapshot before a new request.

Native Chrome checks cover solo Cybercab play, human private plans and settlement, the built-in policy, invitations and reconnect. An external Astra6 player completed three quarters through the room API, including import and service, with independently reconciled books. The source-repository records `docs/v4/M16-RELEASE-REVIEW.md`, `docs/v4/M17-ONLINE-PLAY-REVIEW.md` and `docs/v4/M17-LOCAL-PUBLISHING-REVIEW.md` retain exact scope and limitations; they are not bundled into the exported directory. The immutable R3 package passed an eight-policy-room local draft/resume/settle/read smoke and exact recovery of one Q2 room after a clean restart. That run used `DD_MAX_ROOMS=8`, retaining the normal 8 MiB room limit; it does not certify the default 32-room configuration, public capacity or network/power-loss recovery. Final asset distribution evidence, deployment-specific capacity and whole-game release-gate sign-off remain open.
