# SOLANA BATCH NFT TRANSFER

The purpose of this script is to perform batch NFT transfers from one address to another. These transfers are expected
to originate from the sending wallet. The `batch-transfer.csv` file highlights the mint addresses and the corresponding
recipient address.

# Getting started
1. Install Node.js (>=16.16) and Yarn
2. Install all dependencies
```bash
yarn install
```
3. Setup env variables
```bash
echo "RPC_PROVIDER=<MY_RPC_PROVIDER>
SENDING_WALLET_PRIVATE_KEY=<MY_SENDING_WALLET_PRIVATE_KEY>" >> .env
```
4. Replace the `<MY_RPC_PROVIDER>` env variable in your `.env` file with the Solana Mainnet RPC endpoint of your choice.
5. Replace the `<MY_SENDING_WALLET_PRIVATE_KEY>` env variable in your `.env` file with the Solana Wallet Private Key that holds the NFTs you want to transfer. Make sure this wallet is funded and has some SOL in it.
6. Populate the `batch-transfer.csv` file with the correct NFT mint addresses and corresponding recipient addresses you wish to transfer/deposit the NFTs to.
7. Run the `yarn transfer` command. A Successful operation will print out the signatures.

## LICENSE
MIT License

Copyright (c) 2021 Mirror World Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.