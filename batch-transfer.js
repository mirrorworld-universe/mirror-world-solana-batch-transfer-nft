import { TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction  } from '@solana/spl-token'
import * as web3 from "@solana/web3.js"
import { Wallet } from "@project-serum/anchor"
import bs58 from "bs58"
import axios from "axios"
import { parse } from "csv-parse"
import fs from 'fs'
import path from "path"
import { config } from "dotenv-defaults"
import ora from 'ora'
import chunk from "lodash.chunk"

config({
  path: path.resolve("./.env")
})

const { Connection, Keypair, PublicKey, Transaction } = web3

const RPC_PROVIDER = process.env.RPC_PROVIDER
const SENDING_WALLET_PRIVATE_KEY = process.env.SENDING_WALLET_PRIVATE_KEY

const connection = new Connection(RPC_PROVIDER)

async function createWallet() {
  const keypair = Keypair.fromSecretKey(bs58.decode(SENDING_WALLET_PRIVATE_KEY))
  return new Wallet(keypair)
}


async function createBatchTransferTransaction(mints = [], recipients, from) {
  
  const spinner = ora("Creating Batch Transfer Instructions").start()
  
  const createAtaTransaction = new Transaction()
  const transferTransaction = new Transaction()
  
  if (!mints.length) return
  
  for (let i = 0; i < mints.length; i++) {
    spinner.text = `[${(i + 1)}/${mints.length}] Creating Associated Token Account and Transfer Transactions for mint ${mints[i]}`
    const _mint = new PublicKey(mints[i]);
    const _recipient = new PublicKey(recipients[i]);
    const _from = new PublicKey(from)
  
    const senderAta = await getAssociatedTokenAddress(_mint, _from);
    const recipientAta = await getAssociatedTokenAddress( _mint, _recipient);
    try {
      // Here we attempt to get the account information
      // for the user's ATA. If the account information
      // is retrievable, we do nothing. However if it is not
      // it will throw a "TokenAccountNotFoundError".
      // This means that the recipient's token account has not
      // yet been initialized on-chain.
      await getAccountInfo(connection, recipientAta);
    } catch (error) {
      if (error.message === 'TokenAccountNotFoundError') {
        const createAtaInstruction = await createAssociatedTokenAccountInstruction(
          _from,
          recipientAta,
          _recipient,
          _mint
        );
      
        createAtaTransaction.add(createAtaInstruction);
      }
    }
  
    const transferNftInstruction = await createTransferInstruction(
      senderAta,
      recipientAta,
      _from,
      1,
      []
    )
    
    transferTransaction.add(transferNftInstruction)
  }
  
  spinner.info("Created ATATransaction and Transfer Transaction").start()
  spinner.stop()
  return [createAtaTransaction, transferTransaction]
}

const signAndSendTransaction = async (wallet, transaction, transactionName = "Transaction name", commitment = "finalized") => {
  const spinner = ora(`Sending ${transactionName} Transaction`).start()
  let signed = await wallet.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize());
  const result = await connection.confirmTransaction(signature, commitment);
  if (result.value.err) {
    throw new Error(result.value.err)
  }
  spinner.succeed(`${transactionName} succeeded: ${signature}`)
  
  return [result, signature];
}

async function batchTransferNFTs(_mints, _recipients, wallet) {
  const mintChunks = chunk(_mints, 9)
  const recipientChunks = chunk(_recipients, 9)
  const createTokenAccountTransactionResults = []
  const transferTokensTransactionResults = []
  const chunkSpinner = ora(`Split mints into ${mintChunks.length}`).info()
  
  for (let i = 0; i < mintChunks.length; i++) {
    const mints = mintChunks[i]
    const recipients = recipientChunks[i]
    chunkSpinner.info(`Chunk ${i + 1} of ${mintChunks.length}:: Starting Batch Transfer of ${mints.length} NFTs`).start()
    const [createTokenAccountsTransaction, transferTokensTransaction] = await createBatchTransferTransaction(mints, recipients, wallet.publicKey)
    createTokenAccountsTransaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    createTokenAccountsTransaction.feePayer = wallet.publicKey;
  
    chunkSpinner.stop()
    const [createTokenAccountTransactionResult, createTokenAccountTransactionSignature] = await signAndSendTransaction(wallet, createTokenAccountsTransaction, "createTokenAccountsTransaction")
  
    if (createTokenAccountTransactionResult.value.err) {
      throw new Error(createTokenAccountTransactionResult.value.err)
    }
  
    transferTokensTransaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    transferTokensTransaction.feePayer = wallet.publicKey;
    const [transferTokensTransactionResult, transferTokensTransactionSignature] = await signAndSendTransaction(wallet, transferTokensTransaction, "transferTokensTransaction")
  
    if (transferTokensTransactionResult.value.err) {
      throw new Error(transferTokensTransactionResult.value.err)
    }
  
    createTokenAccountTransactionResults.push([createTokenAccountTransactionResult, createTokenAccountTransactionSignature])
    transferTokensTransactionResults.push([transferTokensTransactionResult, transferTokensTransactionSignature])
    chunkSpinner.succeed(`Chunk ${i + 1} of ${mintChunks.length}:: Successfully performed batch transfer. ${mintChunks.length - (i + 1)} remaining.`)
  }
  
  return {
    createTokenAccounts: createTokenAccountTransactionResults,
    transferTokens: transferTokensTransactionResults,
  };
}


const AccountState = {
  Uninitialized: 0,
  Initialized: 1,
  Frozen: 2,
}

async function getAccountInfo(connection, address, commitment, programId = TOKEN_PROGRAM_ID) {
  const info = await connection.getAccountInfo(address, commitment);
  if (!info) throw new Error('TokenAccountNotFoundError');
  if (!info.owner.equals(programId)) throw new Error('TokenInvalidAccountOwnerError');
  if (info.data.length !== AccountLayout.span) throw new Error('TokenInvalidAccountSizeError');
  
  const rawAccount = AccountLayout.decode(Buffer.from(info.data));
  
  return {
    address,
    mint: rawAccount.mint,
    owner: rawAccount.owner,
    amount: rawAccount.amount,
    delegate: rawAccount.delegateOption ? rawAccount.delegate : null,
    delegatedAmount: rawAccount.delegatedAmount,
    isInitialized: rawAccount.state !== AccountState.Uninitialized,
    isFrozen: rawAccount.state === AccountState.Frozen,
    isNative: !!rawAccount.isNativeOption,
    rentExemptReserve: rawAccount.isNativeOption ? rawAccount.isNative : null,
    closeAuthority: rawAccount.closeAuthorityOption ? rawAccount.closeAuthority : null,
  };
}

function validateAddress(...args) {
  return args.map(address => new PublicKey(address)).every(address => address instanceof PublicKey)
}

async function parseCSV() {
  return new Promise((resolve, reject) => {
    const sourcePath = path.resolve('./batch-transfer.csv')
    if (!sourcePath) reject("batch transfer csv file not found.")
    const recipients = []
    const mints = []
    console.info("Reading and validating addresses")
    fs.createReadStream(sourcePath)
      .pipe(parse())
      .on('data', (row) => {
        const [mintAddress, recipientAddress] = row
        if (row.includes("mint") || row.includes("recipient")) return
        validateAddress(mintAddress, recipientAddress)
        mints.push(mintAddress)
        recipients.push(recipientAddress)
      })
      .on('end', () => {
        console.log('Batch transfer file successfully processed');
        resolve([mints, recipients])
      });
  })
}

const waitFor = (delay = 3000) => new Promise((resolve) => setTimeout(resolve, delay))


async function main () {
  const [mintAddresses, recipients] = await parseCSV()
  const wallet = await createWallet()
  console.info(`starting batch transfer for ${mintAddresses.length} mints from ${wallet.publicKey.toBase58()} to`, recipients)
  const { createTokenAccounts, transferTokens } = await batchTransferNFTs(mintAddresses, recipients, wallet)
  console.info("createTokenAccounts", createTokenAccounts)
  console.info("transferTokens", transferTokens)
}

main()
  .then()


// 9mvnxrTg269go958eUjhWAF9EM4Zx8xRXc8iuKwMFpcW
