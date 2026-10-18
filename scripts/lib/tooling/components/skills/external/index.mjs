// scripts/lib/tooling/components/skills/external/index.mjs — barrel，转发外部技能安装公共 API
export { installExternalSkills } from './install.mjs';
export {
  classifyExternalSource,
  isGitSource,
  resolveExternalSkillSource,
  resolveSkillName,
} from './external-source.mjs';
export {
  buildRegistryInstallMetadata,
  isManagedRegistryInstall,
  resolveAiosHome,
  resolveExternalSkillRegistry,
} from './external-registry.mjs';
export { promptSkillSelection } from './select.mjs';
