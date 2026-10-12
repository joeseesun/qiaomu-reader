// FileView state uses `file`; `path` also keeps older reader states compatible.
// A restored deferred tab must become a real reader before we reveal it.
export async function openReaderLeaf(workspace, file, type) {
  const leaves = workspace.getLeavesOfType(type);
  const leaf = leaves.find(item => item.view.file?.path === file.path) || leaves[0] || workspace.getLeaf("tab");
  // Rendering a reused hidden tab needs live layout. Do not wait for its
  // document to load before activating it: both would wait on each other.
  const opening = leaf.setViewState({ type, state: { file: file.path, path: file.path }, active: true });
  workspace.setActiveLeaf(leaf, { focus: true });
  await opening;
  await leaf.loadIfDeferred?.();
  await workspace.revealLeaf(leaf);
  workspace.setActiveLeaf(leaf, { focus: true });
  return leaf;
}
