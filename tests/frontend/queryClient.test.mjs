import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { onlineManager } from '@tanstack/react-query';
import { queryClient, queryScope } from '../../resources/js/lib/queryClient.ts';

afterEach(() => { queryClient.clear(); onlineManager.setOnline(true); });

test('simultaneous reads share one request', async () => {
    let calls = 0;
    const options = { queryKey: ['lottery', 'ticket', 1, 'abc'], queryFn: async () => { calls++; return { code: 'abc' }; } };
    const [a, b] = await Promise.all([queryClient.fetchQuery(options), queryClient.fetchQuery(options)]);
    assert.deepEqual(a, b);
    assert.equal(calls, 1);
});

test('branch keys and session scopes are distinct', () => {
    queryClient.setQueryData(['lottery', 'ticket', 1, 'abc'], { code: 'abc' });
    assert.equal(queryClient.getQueryData(['lottery', 'ticket', 2, 'abc']), undefined);
    const page = (user, branch) => ({ props: { auth: { user: { id: user }, activeBranchOffice: { id_hash: branch } } } });
    assert.notEqual(queryScope(page(1, 'A')), queryScope(page(1, 'B')));
    assert.notEqual(queryScope(page(1, 'A')), queryScope(page(2, 'A')));
    queryClient.clear();
    assert.equal(queryClient.getQueryData(['lottery', 'ticket', 1, 'abc']), undefined);
});

test('financial mutations fail once even offline instead of waiting for reconnection', async () => {
    onlineManager.setOnline(false);
    let calls = 0;
    const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationFn: async () => { calls++; throw new Error('Network unavailable'); },
    });
    await assert.rejects(mutation.execute({}), /Network unavailable/);
    assert.equal(calls, 1);
    assert.equal(mutation.state.isPaused, false);
    assert.equal(mutation.state.status, 'error');
});
