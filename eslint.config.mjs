import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'assets/js/three.module.js', 'assets/js/firebase-bundle.js'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
