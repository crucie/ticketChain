import { expect } from 'chai';
import { ethers } from 'hardhat';
import { EventTickets1155, OrgRegistry } from '../typechain-types';

describe('OrgRegistry', () => {
  it('registers and deactivates an organisation', async () => {
    const [owner, orgWallet] = await ethers.getSigners();
    const registry = await ethers.deployContract('OrgRegistry');
    await registry.waitForDeployment();

    await expect(registry.registerOrg(orgWallet.address, 'demo-events'))
      .to.emit(registry, 'OrgRegistered')
      .withArgs(orgWallet.address, 'demo-events');

    expect(await registry.isRegistered(orgWallet.address)).to.equal(true);
    expect(await registry.canDeploy(orgWallet.address)).to.equal(true);

    await registry.deactivateOrg(orgWallet.address);
    expect(await registry.isRegistered(orgWallet.address)).to.equal(false);
  });

  it('authorizes a deployer wallet', async () => {
    const [owner, deployer] = await ethers.getSigners();
    const registry = await ethers.deployContract('OrgRegistry');
    await registry.waitForDeployment();

    await registry.authorizeDeployer(deployer.address);
    expect(await registry.canDeploy(deployer.address)).to.equal(true);
  });
});

describe('EventTickets1155', () => {
  let contract: EventTickets1155;
  let orgWallet: Awaited<ReturnType<typeof ethers.getSigners>>[1];
  let buyer: Awaited<ReturnType<typeof ethers.getSigners>>[2];
  let other: Awaited<ReturnType<typeof ethers.getSigners>>[3];

  beforeEach(async () => {
    [, orgWallet, buyer, other] = await ethers.getSigners();
    contract = (await ethers.deployContract('EventTickets1155', [
      orgWallet.address,
      'demo-event-001',
      'https://gateway.pinata.cloud/ipfs/',
    ])) as EventTickets1155;
    await contract.waitForDeployment();
  });

  it('should prevent minting beyond maxSupply', async () => {
    await contract.setTier(1, 2, ethers.parseEther('0.1'), true, 500);
    await contract.mintTicket(buyer.address, 1, 1, { value: ethers.parseEther('0.1') });
    await contract.mintTicket(buyer.address, 1, 1, { value: ethers.parseEther('0.1') });
    await expect(
      contract.mintTicket(buyer.address, 1, 1, { value: ethers.parseEther('0.1') })
    ).to.be.revertedWithCustomError(contract, 'TierSoldOut');
  });

  it('should enforce non-transferable tier', async () => {
    await contract.setTier(2, 10, ethers.parseEther('0.1'), false, 0);
    await contract.mintTicket(buyer.address, 2, 1, { value: ethers.parseEther('0.1') });
    await expect(
      contract
        .connect(buyer)
        ['safeTransferFrom(address,address,uint256,uint256,bytes)'](
          buyer.address,
          other.address,
          2,
          1,
          '0x'
        )
    ).to.be.revertedWithCustomError(contract, 'NotTransferable');
  });

  it('should allow adminMint without payment', async () => {
    await contract.setTier(3, 5, ethers.parseEther('0.1'), true, 500);
    await expect(contract.adminMint(buyer.address, 3, 1))
      .to.emit(contract, 'TicketMinted')
      .withArgs(buyer.address, 3, 3);
    expect(await contract.balanceOf(buyer.address, 3)).to.equal(1n);
  });

  it('should return correct royalty info (EIP-2981)', async () => {
    await contract.setTier(4, 10, ethers.parseEther('0.1'), true, 500);
    const salePrice = ethers.parseEther('1');
    const [receiver, amount] = await contract.royaltyInfo(4, salePrice);
    expect(receiver).to.equal(orgWallet.address);
    expect(amount).to.equal((salePrice * 500n) / 10000n);
  });

  it('should withdraw collected funds to org wallet', async () => {
    await contract.setTier(5, 10, ethers.parseEther('0.1'), true, 500);
    await contract.mintTicket(buyer.address, 5, 1, { value: ethers.parseEther('0.1') });

    const before = await ethers.provider.getBalance(orgWallet.address);
    await contract.withdrawFunds(orgWallet.address);
    const after = await ethers.provider.getBalance(orgWallet.address);

    expect(after - before).to.equal(ethers.parseEther('0.1'));
  });

  it('should record check-in on-chain', async () => {
    const [deployer] = await ethers.getSigners();
    await contract.setTier(6, 10, ethers.parseEther('0.1'), true, 500);
    await contract.adminMint(buyer.address, 6, 1);

    const ticketIdHash = ethers.keccak256(ethers.toUtf8Bytes('ticket-uuid-001'));
    const tx = await contract.checkInTicket(ticketIdHash, buyer.address, 6);
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);

    await expect(tx)
      .to.emit(contract, 'TicketCheckedIn')
      .withArgs(ticketIdHash, buyer.address, 6, deployer.address, block!.timestamp);

    expect(await contract.checkedIn(ticketIdHash)).to.equal(true);
  });

  it('should revert double check-in', async () => {
    await contract.setTier(7, 10, ethers.parseEther('0.1'), true, 500);
    await contract.adminMint(buyer.address, 7, 1);
    const ticketIdHash = ethers.keccak256(ethers.toUtf8Bytes('ticket-uuid-002'));
    await contract.checkInTicket(ticketIdHash, buyer.address, 7);
    await expect(
      contract.checkInTicket(ticketIdHash, buyer.address, 7)
    ).to.be.revertedWithCustomError(contract, 'AlreadyCheckedIn');
  });

  it('should revert check-in from non-owner', async () => {
    await contract.setTier(8, 10, ethers.parseEther('0.1'), true, 500);
    await contract.adminMint(buyer.address, 8, 1);
    const ticketIdHash = ethers.keccak256(ethers.toUtf8Bytes('ticket-uuid-003'));
    await expect(
      contract.connect(buyer).checkInTicket(ticketIdHash, buyer.address, 8)
    ).to.be.revertedWithCustomError(contract, 'OwnableUnauthorizedAccount');
  });
});
