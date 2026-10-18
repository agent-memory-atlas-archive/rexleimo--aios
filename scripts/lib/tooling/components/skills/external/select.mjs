// scripts/lib/tooling/components/skills/external/select.mjs — 多技能来源的交互式勾选
// 职责：当来源含多个技能且用户没有显式选择时，在 TTY 上给出编号清单让用户勾选。
// 非交互环境（CI / agent 调用）不进这里——install 层会先要求 --skill 或 --yes。

import readline from 'node:readline/promises';

function formatSkillLine(index, skill) {
  return `  ${index + 1}. ${skill.name} (${skill.dir})`;
}

// 交互式勾选：a = 全选，逗号分隔的编号或名字 = 部分选择，回车 = 取消。
export async function promptSkillSelection(skills, io = console) {
  io.log(`Source contains ${skills.length} skills:`);
  skills.forEach((skill, index) => io.log(formatSkillLine(index, skill)));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('Install which skills? [a=all, 1,3 or names, Enter=cancel]: ')).trim();
    if (!answer) {
      return [];
    }
    if (answer.toLowerCase() === 'a' || answer.toLowerCase() === 'all') {
      return skills.map((skill) => skill.name);
    }
    const byName = new Map(skills.map((skill) => [skill.name, skill.name]));
    const picked = answer
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const asIndex = Number(token);
        if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= skills.length) {
          return skills[asIndex - 1].name;
        }
        return byName.get(token) || '';
      })
      .filter(Boolean);
    return [...new Set(picked)];
  } finally {
    rl.close();
  }
}
