import { TOKEN_PROGRAM_ID, AccountLayout, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction  } from '@solana/spl-token'
import * as web3 from "@solana/web3.js"
import { Wallet } from "@project-serum/anchor"
import bs58 from "bs58"
import axios from "axios"
import { parse } from "csv-parse"
import fs from 'fs'
import path from "path"
// const ora = require("ora")

import ora from 'ora'

const { Connection, Keypair, PublicKey, Transaction } = web3

const RPC_PROVIDER = "https://fragrant-black-cherry.solana-devnet.quiknode.pro/74fbede70f2b8f6ed9b5bac5bfcda983e8bab832"
const SENDING_WALLET_PRIVATE_KEY = "4AvywotvrULWc2vnwNaTDXueo2chUjkCZkGSyv6vWBZZJMkampgo7xcicKbVsw5BEA9A5JtoKnqWoq71HTzwkbUz"

const connection = new Connection(RPC_PROVIDER)

async function createWallet() {
  const keypair = Keypair.fromSecretKey(bs58.decode(SENDING_WALLET_PRIVATE_KEY))
  return new Wallet(keypair)
}

async function requestNFTAirdrop(recipient) {
  const response = await axios.get(`https://solana-syncer-staging.mirrorworld.fun/launchpad/fractal-faucet/${recipient}`)
  return response.data
}

/**
 * Sends an NFT to a enw user.
 * @param mint NFT mint address to transfer to a new user
 * @param recipient Recipient's publicKey
 * @param wallet
 */
async function transferNft(mint, recipient, wallet) {
  const _mint = new PublicKey(mint);
  const _recipient = new PublicKey(recipient);
  
  const txt = new Transaction();
  
  const senderAta = await getAssociatedTokenAddress(_mint, wallet.publicKey);
  const recipientAta = await getAssociatedTokenAddress( _mint, _recipient);
  
  console.log('recipient  Associated Token Account', recipientAta);
  
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
        wallet.publicKey,
        recipientAta,
        _recipient,
        _mint
      );
      
      txt.add(createAtaInstruction);
    }
  }
  
  // const transferNftInstruction = await Token.createTransferInstruction(TOKEN_PROGRAM_ID, senderAta, recipientAta, wallet.publicKey, [], 1);
  const transferNftInstruction = await createTransferInstruction(
    senderAta,
    recipientAta,
    new PublicKey(wallet.publicKey),
    1,
    []
  )
  txt.add(transferNftInstruction);
  
  txt.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  txt.feePayer = wallet.publicKey;
  
  
  let signed
  
  try {
    signed = await wallet.signTransaction(txt);
  } catch (e) {
    console.error('sender cancelled transaction', e.message);
    throw e;
  }
  
  console.info('Sending the transaction to Solana.');
  
  const signature = await connection.sendRawTransaction(signed.serialize());
  const result = await connection.confirmTransaction(signature, 'confirmed');
  
  if (result.value.err) {
    throw new Error(result.value.err)
  }
  
  console.log('result', result);
  console.log('Successfully transferred nft ', mint, ' from ', wallet.publicKey.toBase58(), ' to ', _recipient.toBase58());
  return [result, signature];
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

async function batchTransferNFTs(mints, recipients, wallet) {
  const spinner = ora(`Starting Batch Transfer of ${mints.length} NFTs`).info().start()
  const [createTokenAccountsTransaction, transferTokensTransaction] = await createBatchTransferTransaction(mints, recipients, wallet.publicKey)
  createTokenAccountsTransaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  createTokenAccountsTransaction.feePayer = wallet.publicKey;
  
  spinner.stop()
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
  
  spinner.succeed(`Successfully performed batch transfer of NFTs`)
  return {
    createTokenAccounts: [createTokenAccountTransactionResult, createTokenAccountTransactionSignature],
    transferTokens: [transferTokensTransactionResult, transferTokensTransactionSignature]
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
  const {createTokenAccounts, transferTokens } = await batchTransferNFTs(mintAddresses, recipients, wallet)
  console.info("createTokenAccounts", createTokenAccounts)
  console.info("transferTokens", transferTokens)
}

main()
  .then()


// 9mvnxrTg269go958eUjhWAF9EM4Zx8xRXc8iuKwMFpcW
