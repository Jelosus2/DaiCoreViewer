export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    let digest: Uint8Array;

    if (globalThis.crypto?.subtle)
    {
        digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    }
    else
    {
        const { sha256 } = await import("@noble/hashes/sha2.js");
        digest = sha256(new Uint8Array(bytes));
    }

    return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
