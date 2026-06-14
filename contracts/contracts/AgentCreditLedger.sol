// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AgentCreditLedger (PharosCred)
/// @notice A credibly-neutral, on-chain credit ledger for AI agents on Pharos.
///         Credit events require BOTH parties to sign an EIP-712 attestation.
///         No party can report unilaterally, no agent can rate itself, and no
///         admin key can alter any score. Paid settlements additionally move
///         real ERC-20 value (e.g. USDC) atomically with the credit record.
contract AgentCreditLedger is EIP712 {
    using SafeERC20 for IERC20;

    struct AgentRecord {
        bool registered;
        string label;
        uint64 total;
        uint64 successful;
        uint64 distinctPartners;
        uint256 volume;
    }

    // Settlement(bytes32 interactionId,address payer,address provider,uint256 amount,bool success)
    bytes32 private constant SETTLEMENT_TYPEHASH =
        keccak256(
            "Settlement(bytes32 interactionId,address payer,address provider,uint256 amount,bool success)"
        );

    // PaidSettlement(bytes32 interactionId,address payer,address provider,address token,uint256 amount)
    bytes32 private constant PAID_SETTLEMENT_TYPEHASH =
        keccak256(
            "PaidSettlement(bytes32 interactionId,address payer,address provider,address token,uint256 amount)"
        );

    mapping(address => AgentRecord) private _agents;
    mapping(bytes32 => bool) private _usedInteraction;
    mapping(address => mapping(address => bool)) private _hasPartnered;

    error AlreadyRegistered();
    error NotRegistered(address agent);
    error InteractionAlreadyUsed(bytes32 interactionId);
    error InvalidPayerSignature();
    error InvalidProviderSignature();
    error SelfDealing();

    event AgentRegistered(address indexed agent, string label);
    event SettlementRecorded(
        bytes32 indexed interactionId,
        address indexed payer,
        address indexed provider,
        uint256 amount,
        bool success
    );
    event PaidSettlementRecorded(
        bytes32 indexed interactionId,
        address indexed payer,
        address indexed provider,
        address token,
        uint256 amount
    );

    constructor() EIP712("PharosCred", "1") {}

    function registerAgent(string calldata label) external {
        if (_agents[msg.sender].registered) revert AlreadyRegistered();
        _agents[msg.sender].registered = true;
        _agents[msg.sender].label = label;
        emit AgentRegistered(msg.sender, label);
    }

    function recordSettlement(
        bytes32 interactionId,
        address payer,
        address provider,
        uint256 amount,
        bool success,
        bytes calldata payerSig,
        bytes calldata providerSig
    ) external {
        _checkParties(interactionId, payer, provider);

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(SETTLEMENT_TYPEHASH, interactionId, payer, provider, amount, success)
            )
        );
        _checkSignatures(digest, payer, provider, payerSig, providerSig);

        _usedInteraction[interactionId] = true;
        _applyOutcome(payer, provider, amount, success);
        _applyOutcome(provider, payer, amount, success);

        emit SettlementRecorded(interactionId, payer, provider, amount, success);
    }

    /// @notice Record a settlement backed by a real ERC-20 payment.
    /// @dev Moves `amount` of `token` from payer to provider atomically with the
    ///      credit record. The payer must have approved this contract for `amount`.
    function recordPaidSettlement(
        bytes32 interactionId,
        address payer,
        address provider,
        address token,
        uint256 amount,
        bytes calldata payerSig,
        bytes calldata providerSig
    ) external {
        _checkParties(interactionId, payer, provider);

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(PAID_SETTLEMENT_TYPEHASH, interactionId, payer, provider, token, amount)
            )
        );
        _checkSignatures(digest, payer, provider, payerSig, providerSig);

        _usedInteraction[interactionId] = true;

        // Move the real payment (payer must have approved this contract).
        IERC20(token).safeTransferFrom(payer, provider, amount);

        // A completed paid interaction counts as successful for both parties.
        _applyOutcome(payer, provider, amount, true);
        _applyOutcome(provider, payer, amount, true);

        emit PaidSettlementRecorded(interactionId, payer, provider, token, amount);
    }

    function _checkParties(bytes32 interactionId, address payer, address provider) private view {
        if (payer == provider) revert SelfDealing();
        if (!_agents[payer].registered) revert NotRegistered(payer);
        if (!_agents[provider].registered) revert NotRegistered(provider);
        if (_usedInteraction[interactionId]) revert InteractionAlreadyUsed(interactionId);
    }

    function _checkSignatures(
        bytes32 digest,
        address payer,
        address provider,
        bytes calldata payerSig,
        bytes calldata providerSig
    ) private pure {
        if (ECDSA.recover(digest, payerSig) != payer) revert InvalidPayerSignature();
        if (ECDSA.recover(digest, providerSig) != provider) revert InvalidProviderSignature();
    }

    function _applyOutcome(
        address subject,
        address partner,
        uint256 amount,
        bool success
    ) private {
        AgentRecord storage a = _agents[subject];
        a.total += 1;
        if (success) {
            a.successful += 1;
            a.volume += amount;
        }
        if (!_hasPartnered[subject][partner]) {
            _hasPartnered[subject][partner] = true;
            a.distinctPartners += 1;
        }
    }

    function getScore(address subject) external view returns (uint256) {
        AgentRecord storage a = _agents[subject];
        if (a.total == 0) return 0;
        uint256 successRate = (uint256(a.successful) * 10000) / a.total;
        uint256 activity = a.total >= 50 ? 10000 : (uint256(a.total) * 10000) / 50;
        uint256 breadth = a.distinctPartners >= 10
            ? 10000
            : (uint256(a.distinctPartners) * 10000) / 10;
        return ((successRate * activity) / 10000) * breadth / 10000;
    }

    function getStats(address subject)
        external
        view
        returns (
            bool registered,
            string memory label,
            uint64 total,
            uint64 successful,
            uint64 distinctPartners,
            uint256 volume
        )
    {
        AgentRecord storage a = _agents[subject];
        return (a.registered, a.label, a.total, a.successful, a.distinctPartners, a.volume);
    }

    function isInteractionUsed(bytes32 interactionId) external view returns (bool) {
        return _usedInteraction[interactionId];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
