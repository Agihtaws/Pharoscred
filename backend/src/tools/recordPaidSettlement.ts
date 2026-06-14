import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { randomUUID } from "node:crypto";
import { getWallet, getWriteContract, getErc20 } from "../chain.js";
import { signPaidSettlement } from "../eip712.js";
import { config } from "../config.js";

function explain(message: string): string {
  if (message.includes("InvalidPayerSignature")) return "The payer signature is invalid.";
  if (message.includes("InvalidProviderSignature")) return "The provider signature is invalid.";
  if (message.includes("InteractionAlreadyUsed")) return "This interactionId has already been recorded.";
  if (message.includes("NotRegistered")) return "Both demo agents must be registered first.";
  if (message.includes("SelfDealing")) return "Payer and provider cannot be the same address.";
  return message;
}


export function registerRecordPaidSettlementTool(server: McpServer): void {
  server.registerTool(
    "record_paid_settlement",
    {
      title: "Record a USDC-backed settlement",
      description:
        "The demo payer pays the demo provider in real test USDC, and that payment backs the " +
        "credit record. Amount is in USDC base units (6 decimals, so 1 USDC = 1000000). The " +
        "server auto-approves USDC if needed. Both scores update on success.",
      inputSchema: {
        amount: z
          .string()
          .describe("USDC amount in base units (6 decimals). 1 USDC = '1000000'."),
        interactionId: z
          .string()
          .optional()
          .describe("Optional 32-byte hex id; auto-generated if omitted"),
      },
    },
    async ({ amount, interactionId }) => {
      try {
        const payerWallet = getWallet("payer");
        const providerWallet = getWallet("provider");
        const payer = await payerWallet.getAddress();
        const provider = await providerWallet.getAddress();
        const token = config.usdcAddress;
        const value = BigInt(amount);

        // Pre-flight: make sure the payer actually holds enough USDC.
        const usdcRead = getErc20(token);
        const balance: bigint = await usdcRead.balanceOf(payer);
        if (balance < value) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text:
                  `Payer USDC balance (${balance.toString()}) is below the amount ` +
                  `(${value.toString()}). Fund ${payer} from Circle's faucet (faucet.circle.com).`,
              },
            ],
          };
        }

        // Ensure the contract is approved to pull `value` of USDC from the payer.
        const usdcWrite = getErc20(token, payerWallet);
        const allowance: bigint = await usdcRead.allowance(payer, config.contractAddress);
        let approveTx: string | undefined;
        if (allowance < value) {
          const ax = await usdcWrite.approve(config.contractAddress, value);
          await ax.wait();
          approveTx = ax.hash;
        }

        const id = interactionId ?? ethers.id(randomUUID());
        if (!ethers.isHexString(id, 32))
          throw new Error("interactionId must be a 32-byte hex string");

        const fields = { interactionId: id, payer, provider, token, amount: value };
        const payerSig = await signPaidSettlement(payerWallet, fields);
        const providerSig = await signPaidSettlement(providerWallet, fields);

        const contract = getWriteContract("payer");
        const args = [id, payer, provider, token, value, payerSig, providerSig] as const;
        const gasEstimate = await contract.recordPaidSettlement.estimateGas(...args);
        const gasLimit = (gasEstimate * 12n) / 10n;
        const tx = await contract.recordPaidSettlement(...args, { gasLimit });
        const receipt = await tx.wait();

        const result = {
          interactionId: id,
          payer,
          provider,
          token,
          amount,
          amountUsdc: (Number(value) / 1e6).toString(),
          approveTx,
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber,
          status: receipt?.status === 1 ? "success" : "failed",
          explorer: `${config.explorerUrl}/tx/${tx.hash}`,
          note: "Real USDC moved from payer to provider, and both scores updated. The credit is backed by an actual payment.",
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            { type: "text" as const, text: `record_paid_settlement failed: ${explain(message)}` },
          ],
        };
      }
    }
  );
}