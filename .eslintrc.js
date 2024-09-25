module.exports = {
	extends: [
		'plugin:@typescript-eslint/recommended',
		// 'eslint:recommended',
		// '@shawnphoffman/eslint-config',
	],

	rules: {
		// Note: you must disable the base rule as it can report incorrect errors
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': 'warn',
		'@typescript-eslint/no-explicit-any': 'warn',
	},
}
