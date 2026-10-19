'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { verify, hook } = require('./verify-rules.cjs');
const source = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
const config = { firestore: { rules: 'firestore.rules', predeploy: [hook] } };
test('approved safe rules accepted', () => verify(source, config));
test('safe CRLF checkout accepted', () => verify(source.replace(/\r?\n/g, '\r\n'), config));
test('old binding privileges cannot be restored', () => assert.throws(() => verify(source.replace('return false;', 'return true;'), config)));
test('browser ownership claim cannot be restored', () => assert.throws(() => verify(source.replace('match /bindings/{uid} { allow read, write: if false; }', 'match /bindings/{uid} { allow read, write: if signedIn(); }'), config)));
test('protected admin UID cannot change silently', () => assert.throws(() => verify(source.replace('OpXzKToeVbd9xp1KHuqnD95yXlm2', 'unreviewed-admin'), config)));

test('directory write authority cannot be widened', () => assert.throws(() => verify(source.replace('allow create: if isAmjad() && validDirectoryMember()', 'allow create: if signedIn() && validDirectoryMember()'), config)));

test('the previously approved hide-only rules cannot replace the permanent-delete release', () => {
  const previous = readFileSync(resolve(__dirname, '../../rules/firestore.directory-candidate.rules'), 'utf8');
  assert.throws(() => verify(previous, config));
});
test('directory deletion cannot be granted to ordinary users', () => assert.throws(() => verify(source.replace('allow delete: if isAmjad() && directoryId()', 'allow delete: if signedIn() && directoryId()'), config)));

test('the previous directory release cannot replace the approved avatar rules', () => {
  const previous = readFileSync(resolve(__dirname, '../../rules/firestore.directory-crud-candidate.rules'), 'utf8');
  assert.throws(() => verify(previous, config));
});

test('avatar write authority cannot be widened', () => assert.throws(() => verify(source.replace('allow create: if isAmjad() && validAmjadAvatar()', 'allow create: if signedIn() && validAmjadAvatar()'), config)));

test('admin avatar cannot silently become a rename or deletion grant', () => {
  assert.throws(() => verify(source.replace("hasOnly(['src','revision','updatedAt'])", "hasOnly(['name','src','revision','updatedAt'])"), config));
  assert.throws(() => verify(source.replace('match /directoryMembers/member_9 {', 'match /directoryMembers/member_9 { allow delete: if isAmjad();'), config));
});
test('alternate rules file rejected', () => assert.throws(() => verify(source, { firestore: { rules: 'old.rules', predeploy: [hook] } })));
test('removed predeploy guard rejected', () => assert.throws(() => verify(source, { firestore: { rules: 'firestore.rules' } })));
