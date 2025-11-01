import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import chalk from "chalk";

// kebab-case validation function
function isValidKebabCase(name) {
  // 영문 소문자, 숫자, 하이픈만 허용, 하이픈으로 시작/끝나면 안됨
  const kebabCaseRegex = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  return kebabCaseRegex.test(name);
}

// Convert project name to different case formats
function toPascalCase(kebabStr) {
  return kebabStr
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Update package.json with project info
async function updatePackageJson(targetDir, projectName, description) {
  const packageJsonPath = path.join(targetDir, "package.json");
  const packageJson = await fs.readJson(packageJsonPath);

  packageJson.name = projectName;
  packageJson.description = description;
  packageJson.browser = `dist/${projectName}.js`;
  packageJson.unpkg = `dist/${projectName}.js`;

  await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
}

// Update README.md with project info
async function updateReadme(targetDir, projectName) {
  const readmePath = path.join(targetDir, "README.md");
  let readme = await fs.readFile(readmePath, "utf-8");

  // Replace placeholders
  readme = readme.replace(/\$\{프로젝트명\}/g, projectName);
  readme = readme.replace(/\$\{파일명\}/g, projectName);

  await fs.writeFile(readmePath, readme, "utf-8");
}

// Update src/constants.js with project info
async function updateConstants(targetDir, projectName, description) {
  const constantsPath = path.join(targetDir, "src", "constants.js");
  let constants = await fs.readFile(constantsPath, "utf-8");

  // Replace fallback values
  constants = constants.replace(/\$\{프로젝트명\}/g, projectName);

  await fs.writeFile(constantsPath, constants, "utf-8");
}

export async function createProject() {
  try {
    console.log(chalk.cyan("🌮 Risu Plugin Scaffold Builder 🥠\n"));

    // Get project name with validation
    const { projectName } = await inquirer.prompt([
      {
        name: "projectName",
        message: "프로젝트 이름을 입력하세요 (kebab-case, 영문만):",
        default: "my-risu-plugin",
        validate: (input) => {
          if (!input || input.trim() === "") {
            return "프로젝트 이름은 필수입니다.";
          }
          if (!isValidKebabCase(input)) {
            return "kebab-case 형식으로 입력하세요 (예: my-risu-plugin)\n영문 소문자, 숫자, 하이픈(-)만 사용 가능하며, 하이픈으로 시작하거나 끝날 수 없습니다.";
          }
          return true;
        }
      }
    ]);

    // Get project description
    const { description } = await inquirer.prompt([
      {
        name: "description",
        message: "프로젝트 설명을 입력하세요:",
        default: `${toPascalCase(projectName)} for RISU AI`
      }
    ]);

    // Select template
    const templateMessage = `
  어떤 템플릿을 사용하시겠어요? (추후 기능 추가를 통한 옵션 제공 예정...)
  sample : 샘플 템플릿 - 옵저버 기반 버튼 추가를 통한 플러그인 예시를 제공합니다
  `;
    const { template } = await inquirer.prompt([
      {
        name: "template",
        type: "list",
        message: templateMessage,
        choices: ["sample"]
      }
    ]);

    const targetDir = path.resolve(process.cwd(), projectName);

    // Check if directory already exists
    if (fs.existsSync(targetDir)) {
      console.log(chalk.red("❌ 동일한 이름의 폴더가 이미 존재합니다."));
      process.exit(1);
    }

    // Get template directory (fix Windows path issue)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const templateDir = path.resolve(__dirname, `../templates/${template}`);

    // Verify template exists
    if (!fs.existsSync(templateDir)) {
      console.log(chalk.red(`❌ 템플릿 디렉토리를 찾을 수 없습니다: ${templateDir}`));
      process.exit(1);
    }

    // Copy template
    console.log(chalk.yellow("📦 템플릿 복사 중..."));
    await fs.copy(templateDir, targetDir);

    // Update template files
    console.log(chalk.yellow("⚙️  프로젝트 설정 중..."));
    await updatePackageJson(targetDir, projectName, description);
    await updateReadme(targetDir, projectName);
    await updateConstants(targetDir, projectName, description);

    // Install dependencies
    console.log(chalk.yellow("📦 패키지 설치 중..."));
    await execa("npm", ["install"], { cwd: targetDir, stdio: "inherit" });

    // Success message
    console.log(chalk.green("\n✅ 프로젝트 생성 완료!\n"));
    console.log(chalk.cyan("다음 단계:"));
    console.log(chalk.white(`  1. cd ${projectName}`));
    console.log(chalk.white(`  2. npm run dev     ${chalk.gray("# 개발 모드 (Hot Reload)")}`));
    console.log(chalk.white(`  3. npm run build   ${chalk.gray("# 프로덕션 빌드")}\n`));

  } catch (error) {
    console.error(chalk.red("\n❌ 에러 발생:"), error.message);
    process.exit(1);
  }
}
