import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

/**
 * Deploy TicketMarketplace only on MST testnet.
 * Constructor: (platformFeeRecipient, royaltyReceiver, platformFeeBps, royaltyBps)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deployer:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Balance:', ethers.formatEther(balance), 'native');
  if (balance === 0n) {
    throw new Error('Deployer has zero balance — fund with MST testnet gas first');
  }

  const platformFeeBps = 200; // 2%
  const royaltyBps = 500; // 5%

  const marketplace = await ethers.deployContract('TicketMarketplace', [
    deployer.address,
    deployer.address,
    platformFeeBps,
    royaltyBps,
  ]);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  const deployTx = marketplace.deploymentTransaction();

  console.log('TicketMarketplace:', marketplaceAddress);
  if (deployTx?.hash) {
    console.log('Deploy tx:', deployTx.hash);
  }

  const outDir = path.resolve(__dirname, '../deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'mstTestnet-marketplace.json');
  const payload = {
    network: 'mstTestnet',
    ticketMarketplace: marketplaceAddress,
    platformFeeRecipient: deployer.address,
    royaltyReceiver: deployer.address,
    platformFeeBps,
    royaltyBps,
    deployTxHash: deployTx?.hash ?? null,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`\nSaved ${file}`);
  console.log('\nUpdate .env / Secrets Manager:');
  console.log(`MARKETPLACE_CONTRACT_ADDRESS=${marketplaceAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
