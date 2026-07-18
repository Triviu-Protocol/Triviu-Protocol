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

## Prove the detector against real reserves (no deploy needed)

With the fork running, exercise the production engine code against live Polygon
pool reserves — no mocks, no transactions:

    cd engine && npm install
    TRIVIU_RPC=http://127.0.0.1:8545 npx tsx scripts/verify-fork.ts

It discovers the QuickSwap WMATIC/USDC.e/WETH triangle from the factory, reads
reserves through the real `fetchEdges`, and runs Bellman-Ford. "No profitable
cycle" is the expected, honest result most of the time — see the risk notice.

The project's official path: **fork -> audit -> mainnet.**
Skipping the fork rehearsal is at your own risk — and defeats the educational
purpose of this repo.
