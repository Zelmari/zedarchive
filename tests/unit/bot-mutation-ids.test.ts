import { describe, it, expect } from 'vitest';
import {
  isMutatingButtonCustomId,
  isMutatingSelectCustomId,
  isMutatingModalCustomId,
} from '../../bot/src/interactions/mutation-ids';

describe('mutating component customIds', () => {
  it('flags title and edit write buttons', () => {
    const id = 'a0000000-0000-0000-0000-000000000001';
    expect(isMutatingButtonCustomId(`za:title:${id}:step`)).toBe(true);
    expect(isMutatingButtonCustomId(`za:title:${id}:complete`)).toBe(true);
    expect(isMutatingButtonCustomId(`za:edit:${id}:complete`)).toBe(true);
    expect(isMutatingButtonCustomId(`za:add:abcd1234:submit`)).toBe(true);
  });

  it('does not flag read or modal-open buttons', () => {
    const id = 'a0000000-0000-0000-0000-000000000001';
    expect(isMutatingButtonCustomId(`za:title:${id}:edit`)).toBe(false);
    expect(isMutatingButtonCustomId(`za:edit:${id}:modal_progress`)).toBe(false);
    expect(isMutatingButtonCustomId(`za:lib:cacheid1:1`)).toBe(false);
    expect(isMutatingButtonCustomId('za:auth:unlink_confirm:1')).toBe(false);
  });

  it('flags rate selects but not catalog pick, title pick, or status select', () => {
    expect(isMutatingSelectCustomId('za:edit:id:select_rate')).toBe(true);
    expect(isMutatingSelectCustomId('za:add:draftid:select_rate')).toBe(true);
    expect(isMutatingSelectCustomId('za:add:catalog_pick:show:deadbeef')).toBe(false);
    expect(isMutatingSelectCustomId('za:pick:deadbeef')).toBe(false);
    expect(isMutatingSelectCustomId('za:edit:id:select_status')).toBe(false);
  });

  it('flags progress, notes, and drop modals', () => {
    expect(isMutatingModalCustomId('za:edit_modal_progress:id')).toBe(true);
    expect(isMutatingModalCustomId('za:edit_modal_notes:id')).toBe(true);
    expect(isMutatingModalCustomId('za:edit_modal_drop:id')).toBe(true);
    expect(isMutatingModalCustomId('za:add_modal_drop:draft')).toBe(true);
    expect(isMutatingModalCustomId('za:add_modal_details:draft')).toBe(false);
  });
});
