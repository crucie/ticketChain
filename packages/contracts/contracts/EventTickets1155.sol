// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EventTickets1155
/// @notice ERC-1155 multi-tier NFT ticket contract — one deployment per event.
/// @dev Royalties enforced via EIP-2981 at the contract level.
contract EventTickets1155 is ERC1155, ERC2981, Ownable, ReentrancyGuard {
    struct TierConfig {
        uint256 maxSupply;
        uint256 priceWei;
        bool isTransferable;
        uint16 royaltyBps;
        bool paused;
        bool configured;
    }

    string public eventId;
    address public royaltyReceiver;

    mapping(uint256 tierId => TierConfig) private _tiers;
    mapping(uint256 tierId => uint256) public totalMinted;
    /// @notice Off-chain ticket UUID hashed (keccak256) → gate attendance recorded on-chain
    mapping(bytes32 ticketIdHash => bool) public checkedIn;

    event TicketMinted(address indexed to, uint256 indexed tierId, uint256 tokenId);
    event TicketTransferred(address indexed from, address indexed to, uint256 indexed tokenId);
    event TicketCheckedIn(
        bytes32 indexed ticketIdHash,
        address indexed owner,
        uint256 indexed tierId,
        address scannedBy,
        uint256 timestamp
    );
    event TierPaused(uint256 indexed tierId);
    event TierUnpaused(uint256 indexed tierId);
    event TierConfigured(uint256 indexed tierId);
    event FundsWithdrawn(address indexed to, uint256 amount);

    error TierNotConfigured();
    error TierPausedError();
    error TierSoldOut();
    error NotTransferable();
    error InvalidPayment();
    error InvalidQuantity();
    error InvalidTier();
    error AlreadyCheckedIn();
    error InvalidTicketHash();
    error InvalidOwner();

    constructor(
        address _royaltyReceiver,
        string memory _eventId,
        string memory baseURI
    ) ERC1155(baseURI) Ownable(msg.sender) {
        require(_royaltyReceiver != address(0), "Invalid royalty receiver");
        royaltyReceiver = _royaltyReceiver;
        eventId = _eventId;
    }

    function setTier(
        uint256 tierId,
        uint256 supply,
        uint256 priceWei,
        bool transferable,
        uint16 royaltyBps
    ) external onlyOwner {
        if (tierId == 0) revert InvalidTier();
        _tiers[tierId] = TierConfig({
            maxSupply: supply,
            priceWei: priceWei,
            isTransferable: transferable,
            royaltyBps: royaltyBps,
            paused: false,
            configured: true
        });
        _setTokenRoyalty(tierId, royaltyReceiver, royaltyBps);
        emit TierConfigured(tierId);
    }

    function pauseTier(uint256 tierId) external onlyOwner {
        TierConfig storage tier = _requireTier(tierId);
        tier.paused = true;
        emit TierPaused(tierId);
    }

    function unpauseTier(uint256 tierId) external onlyOwner {
        TierConfig storage tier = _requireTier(tierId);
        tier.paused = false;
        emit TierUnpaused(tierId);
    }

    function mintTicket(
        address to,
        uint256 tierId,
        uint256 quantity
    ) external payable onlyOwner nonReentrant returns (uint256 tokenId) {
        _mintInternal(to, tierId, quantity, true);
        return tierId;
    }

    function adminMint(
        address to,
        uint256 tierId,
        uint256 quantity
    ) external onlyOwner nonReentrant returns (uint256 tokenId) {
        _mintInternal(to, tierId, quantity, false);
        return tierId;
    }

    /// @notice Custodial transfer by contract owner (backend deployer wallet).
    function adminTransfer(
        address from,
        address to,
        uint256 tierId,
        uint256 quantity
    ) external onlyOwner nonReentrant {
        _safeTransferFrom(from, to, tierId, quantity, "");
    }

    /// @notice Record gate check-in on-chain. Gas paid by owner (platform deployer).
    /// @dev Does not burn the NFT — attendance proof only. `ticketIdHash` is keccak256 of off-chain ticket UUID.
    function checkInTicket(
        bytes32 ticketIdHash,
        address owner,
        uint256 tierId
    ) external onlyOwner {
        if (ticketIdHash == bytes32(0)) revert InvalidTicketHash();
        if (owner == address(0)) revert InvalidOwner();
        _requireTier(tierId);
        if (checkedIn[ticketIdHash]) revert AlreadyCheckedIn();

        checkedIn[ticketIdHash] = true;
        emit TicketCheckedIn(ticketIdHash, owner, tierId, msg.sender, block.timestamp);
    }

    function withdrawFunds(address to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");
        (bool sent, ) = to.call{value: balance}("");
        require(sent, "Transfer failed");
        emit FundsWithdrawn(to, balance);
    }

    function maxSupply(uint256 tierId) external view returns (uint256) {
        return _tiers[tierId].maxSupply;
    }

    function isTransferable(uint256 tierId) external view returns (bool) {
        return _tiers[tierId].isTransferable;
    }

    function getTierConfig(uint256 tierId) external view returns (TierConfig memory) {
        return _tiers[tierId];
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _mintInternal(
        address to,
        uint256 tierId,
        uint256 quantity,
        bool requirePayment
    ) internal {
        if (quantity == 0) revert InvalidQuantity();
        TierConfig storage tier = _requireTier(tierId);
        if (tier.paused) revert TierPausedError();
        if (totalMinted[tierId] + quantity > tier.maxSupply) revert TierSoldOut();

        if (requirePayment) {
            if (msg.value != tier.priceWei * quantity) revert InvalidPayment();
        }

        totalMinted[tierId] += quantity;
        _mint(to, tierId, quantity, "");
        emit TicketMinted(to, tierId, tierId);
    }

    function _requireTier(uint256 tierId) internal view returns (TierConfig storage) {
        TierConfig storage tier = _tiers[tierId];
        if (!tier.configured) revert TierNotConfigured();
        return tier;
    }

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                if (!_tiers[ids[i]].isTransferable) revert NotTransferable();
            }
        }

        super._update(from, to, ids, values);

        if (from != address(0) && to != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                emit TicketTransferred(from, to, ids[i]);
            }
        }
    }
}
