import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement, useState } from 'react';
import { create, act } from 'react-test-renderer';
import { transpileModule, JsxEmit, ModuleKind } from 'typescript';

// Node's type stripping does not accept TSX. Compile this real component in
// memory and resolve React to the same instance as the renderer.
const source = await readFile(new URL('../src/components/NumericInput.tsx', import.meta.url), 'utf8');
const compiled = transpileModule(source, {compilerOptions: {jsx: JsxEmit.ReactJSX, module: ModuleKind.ESNext}}).outputText
  .replace(/from (["'])(react(?:\/jsx-runtime)?)\1/g, (_match, _quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const {NumericInput} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function input(initial: number | null = 60) {
  const commits: (number | null)[] = [];
  let external: (value: number | null) => void = () => {};
  function Harness() {
    const [value, setValue] = useState(initial); external = setValue;
    return createElement(NumericInput, {value, label: 'Váha', max: 1000, onCommit: (value: number | null) => { commits.push(value); setValue(value); }});
  }
  let root: ReturnType<typeof create>;
  await act(async () => { root = create(createElement(Harness)); });
  const props = () => root!.root.findByType('input').props;
  const change = async (value: string) => { await act(async () => { props().onChange({currentTarget: {value, valueAsNumber: value === '' ? NaN : Number(value)}}); }); };
  const focus = async () => { await act(async () => { props().onFocus(); }); };
  const blur = async (badInput = false) => { await act(async () => { props().onBlur({currentTarget: {validity: {badInput}}}); }); };
  const receive = async (value: number) => { await act(async () => external(value)); };
  const close = async () => { await act(async () => root!.unmount()); };
  return {commits, props, change, focus, blur, receive, close};
}

test('a valid weight is committed before blur and remains saved when the mobile app closes with focus in the field', async () => {
  const field = await input(); await field.focus(); await field.change('72.5');
  assert.deepEqual(field.commits, [72.5]);
  await field.close(); assert.deepEqual(field.commits, [72.5]);
});

test('leaving an old focused PC field does not overwrite a newer phone value, even after an earlier local edit', async () => {
  const field = await input(); await field.focus(); await field.receive(80); await field.blur();
  assert.deepEqual(field.commits, []); assert.equal(field.props().value, '80');
  await field.focus(); await field.change('82.5'); await field.receive(85); await field.blur();
  assert.deepEqual(field.commits, [82.5]); assert.equal(field.props().value, '85'); await field.close();
});

test('temporary blanks and invalid drafts preserve saved loads, explicit clears and recorded zero remain supported', async () => {
  const field = await input(); await field.focus(); await field.change('');
  assert.deepEqual(field.commits, []);
  await field.change('1001'); await field.blur(); assert.deepEqual(field.commits, []); assert.equal(field.props().value, '60');
  await field.focus(); await field.change('0'); await field.blur(); assert.deepEqual(field.commits, [0]);
  await field.focus(); await field.change(''); await field.blur(true); assert.deepEqual(field.commits, [0]);
  await field.focus(); await field.change(''); await field.blur(); assert.deepEqual(field.commits, [0, null]); await field.close();
});
