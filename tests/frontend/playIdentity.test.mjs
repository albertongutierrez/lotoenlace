import test from 'node:test';
import assert from 'node:assert/strict';
import { newPlays } from '../../resources/js/lib/playIdentity.ts';
const line = { draw_id: 1, modality: 'pale', numbers: '01-02', amount: '10' };
test('omite repetidas e invertidas sin afectar sorteos distintos', () => {
 assert.deepEqual(newPlays([line], [{...line}, {...line,numbers:'02-01'}, {...line,draw_id:2}]), [{...line,draw_id:2}]);
});
test('evita duplicados en un mismo lote y al aplicar dos veces', () => {
 const first = newPlays([], [line,line]);
 assert.equal(first.length,1);
 assert.equal(newPlays(first,[line]).length,0);
});
test('conserva orden y pareja de super pale', () => {
 const sp = {...line, modality:'super_pale',second_draw_id:2};
 assert.equal(newPlays([sp],[{...sp,numbers:'02-01'},{...sp,second_draw_id:3}]).length,2);
});
