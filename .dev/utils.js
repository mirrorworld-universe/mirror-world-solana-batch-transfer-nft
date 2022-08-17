import * as web3 from "@solana/web3.js"
import axios from "axios"

const { Keypair } = web3

async function requestNFTAirdrop(recipient) {
  const response = await axios.get(`https://solana-syncer-staging.mirrorworld.fun/launchpad/fractal-faucet/${recipient}`)
  return response.data
}

async function requestBatchNFTAirdrop(address, count = 10) {
  const airdropNFTsAddresses = []
  for (let i = 0; i < count; i++) {
    const nft = await requestNFTAirdrop(address)
    airdropNFTsAddresses.push(nft.token_address)
  }
  console.log("airdropNFTsAddresses", airdropNFTsAddresses)
  return airdropNFTsAddresses
}

const waitFor = (delay = 3000) => new Promise((resolve) => setTimeout(resolve, delay))
const createRecipients = (count = 10) => Array.from(Array(count).keys()).map(() => new Keypair().publicKey.toBase58())

async function run () {
  const count = 9
  const mintAddreses = await requestBatchNFTAirdrop("9mvnxrTg269go958eUjhWAF9EM4Zx8xRXc8iuKwMFpcW", count)
  const recipients = createRecipients(count)
  let data = ``
  for (let i = 0; i < count; i++) {
    data.concat(mintAddreses[i], ',', recipients[i], '\n')
    data += `${mintAddreses[i]},${recipients[i]}\n`
  }
  
  console.log(data)
}


run()

//z5p8sUUsFgsopZHgmqvFeFbuYaGeYCxQ2rWuVNRadtC,Deajba9ZDBXc5mNTq5Q54NY3vECos23Um6XXT7YCLVUg