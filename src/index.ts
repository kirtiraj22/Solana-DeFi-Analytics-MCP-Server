import { Connection, PublicKey } from "@solana/web3.js";

const main = async () => {
	const connection = new Connection(
		"https://api.devnet.solana.com",
		"confirmed"
	);

	const publicKey = new PublicKey(
		"6atmHfEydp2PHF9QPhhzzApJfnKzJonKTFcE99oYea5L"
	);
	const balance = await connection.getBalance(publicKey);

	console.log(`Balance: ${balance / 1e9} SOL`);
};

main().catch(console.error);
