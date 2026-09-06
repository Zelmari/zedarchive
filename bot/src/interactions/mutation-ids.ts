/**
 * Detects Discord component customIds that perform domain writes (mutations).
 */
export function isMutatingButtonCustomId(customId: string): boolean {
  const parts = customId.split(':');
  if (parts.length < 4 || parts[0] !== 'za') return false;

  const namespace = parts[1];

  if (namespace === 'title') {
    const action = parts[3];
    return action === 'step' || action === 'complete';
  }

  if (namespace === 'edit') {
    const action = parts[3];
    return action === 'complete';
  }

  if (namespace === 'add') {
    const action = parts[3];
    return action === 'submit';
  }

  if (namespace === 'lib' || namespace === 'auth') {
    return false;
  }

  return false;
}

export function isMutatingSelectCustomId(customId: string): boolean {
  if (customId.startsWith('za:pick:')) {
    return true;
  }

  if (customId.startsWith('za:add:catalog_pick:')) {
    return false;
  }

  if (customId.endsWith(':select_status') || customId.endsWith(':select_rate')) {
    return customId.startsWith('za:edit:') || customId.startsWith('za:add:');
  }

  return false;
}

export function isMutatingModalCustomId(customId: string): boolean {
  return (
    customId.startsWith('za:edit_modal_progress:') ||
    customId.startsWith('za:edit_modal_notes:') ||
    customId.startsWith('za:edit_modal_drop:') ||
    customId.startsWith('za:add_modal_drop:')
  );
}
