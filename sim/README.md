# Fork simulation — start here

Mistakes here are free. Mistakes on mainnet pay gas.

## Steps

1. Install Foundry (forge/anvil/cast): https://book.getfoundry.sh
2. Spin up a local Polygon fork:

   anvil --fork-url $POLYGON_RPC

3. Point `engine/config/params.toml` at `http://127.0.0.1:8545`
   and keep `dry_run = true`.
4. Run the engine: `cd engine && npm install && npm run dev`.
5. Inspect calls with `cast call` / `cast run` before any testnet.

The project's official path: **fork -> testnet (Amoy) -> audit -> mainnet.**
Skipping steps is at your own risk — and defeats the educational purpose of this repo.
