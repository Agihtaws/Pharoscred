import { ethers } from "ethers";
import { config } from "./config.js";

export const SETTLEMENT_TYPES = {
  Settlement: [
    { name: "interactionId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "provider", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "success", type: "bool" },
  ],
};

export function settlementDomain() {
  return {
    name: "PharosCred",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.contractAddress,
  };
}

export interface SettlementFields {
  interactionId: string; // 32-byte hex
  payer: string;
  provider: string;
  amount: bigint;
  success: boolean;
}

/** Produces an EIP-712 signature over a settlement for the given wallet. */
export async function signSettlement(
  wallet: ethers.Wallet,
  fields: SettlementFields
): Promise<string> {
  return wallet.signTypedData(settlementDomain(), SETTLEMENT_TYPES, {
    interactionId: fields.interactionId,
    payer: fields.payer,
    provider: fields.provider,
    amount: fields.amount,
    success: fields.success,
  });
}

/** EIP-712 type for a settlement backed by a real ERC-20 payment. */
export const PAID_SETTLEMENT_TYPES = {
  PaidSettlement: [
    { name: "interactionId", type: "bytes32" },
    { name: "payer", type: "address" },
    { name: "provider", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
};

export interface PaidSettlementFields {
  interactionId: string;
  payer: string;
  provider: string;
  token: string;
  amount: bigint;
}

/** Produces an EIP-712 signature over a paid settlement for the given wallet. */
export async function signPaidSettlement(
  wallet: ethers.Wallet,
  fields: PaidSettlementFields
): Promise<string> {
  return wallet.signTypedData(settlementDomain(), PAID_SETTLEMENT_TYPES, {
    interactionId: fields.interactionId,
    payer: fields.payer,
    provider: fields.provider,
    token: fields.token,
    amount: fields.amount,
  });
}