import { MIN_AMOUNT_OF_RECORDS_TO_TRAIN } from '@app/common/constants';
import { exportCategoryLogsToCsv } from '@app/common/utils';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WeightsService implements OnModuleDestroy {
  private readonly logger = new Logger(WeightsService.name);

  private activeProcesses = new Set<ChildProcess>();

  constructor(
    private prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleDestroy() {
    if (this.activeProcesses.size > 0) {
      this.logger.log(
        `Killing ${this.activeProcesses.size} active Python processes...`,
      );
      for (const proc of this.activeProcesses) {
        try {
          proc.kill('SIGTERM');
        } catch (e) {}
      }
      this.activeProcesses.clear();
    }
  }

  async trainCategory(categoryId: string) {
    const scriptPath = this.configService.get('PYTHON_SCRIPT_PATH');
    const rootDir = process.cwd();
    const absoluteScriptPath = path.resolve(rootDir, scriptPath);
    const tempDir = path.resolve(rootDir, 'temp');
    const csvFile = path.resolve(
      tempDir,
      `train_${categoryId}_${Date.now()}.csv`,
    );

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    try {
      const logsCount = await this.prismaService.fSRSCardLog.count({
        where: {
          fsrsCard: {
            card: { deck: { deckCategoryId: categoryId } },
          },
        },
      });

      if (logsCount < MIN_AMOUNT_OF_RECORDS_TO_TRAIN) {
        this.logger.debug(`Skip category ${categoryId}: not enough logs.`);
        return;
      }

      await exportCategoryLogsToCsv(this.prismaService, categoryId, csvFile);

      const newWeights = await this.runPythonScript(
        absoluteScriptPath,
        csvFile,
      );

      if (newWeights && newWeights.length === 17) {
        await this.saveWeights(categoryId, newWeights);
        this.logger.log(`Weights updated for category: ${categoryId}`);
      } else {
        this.logger.warn(`Python returned invalid weights for ${categoryId}`);
      }
    } catch (error) {
      this.logger.error(`Training error [${categoryId}]: ${error.message}`);
    } finally {
      if (fs.existsSync(csvFile)) {
        try {
          fs.unlinkSync(csvFile);
        } catch (e) {}
      }
    }
  }

  private async runPythonScript(
    scriptPath: string,
    csvPath: string,
  ): Promise<number[] | null> {
    return new Promise((resolve, reject) => {
      const pythonPath = this.configService.get('PYTHON_EXECUTABLE');

      // ИЗМЕНЕНИЕ 3: Передаем process.env и добавляем в Set
      const child = spawn(pythonPath, [scriptPath, csvPath], {
        cwd: path.resolve(process.cwd(), 'temp'),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });

      this.activeProcesses.add(child);

      let stdoutData = '';
      let stderrData = '';

      child.on('error', (err) => {
        this.activeProcesses.delete(child);
        this.logger.error(`Spawn Error: ${err.message}`);
        resolve(null);
      });

      child.stdout?.on('data', (data) => {
        stdoutData += data.toString();
      });
      child.stderr?.on('data', (data) => {
        stderrData += data.toString();
      });

      child.on('close', (code) => {
        this.activeProcesses.delete(child);

        if (code !== 0) {
          this.logger.error(`Python exited code ${code}: ${stderrData}`);
          return resolve(null);
        }

        try {
          const jsonMatch = stdoutData.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            return resolve(null);
          }
          const result = JSON.parse(jsonMatch[0]);
          if (result.success && Array.isArray(result.weights)) {
            resolve(result.weights);
          } else {
            resolve(null);
          }
        } catch (e) {
          this.logger.error(`JSON Parse Error: ${e.message}`);
          resolve(null);
        }
      });
    });
  }

  private async saveWeights(categoryId: string, weights: number[]) {
    await this.prismaService.fSRSWeights.upsert({
      where: { categoryId },
      create: { categoryId, w: weights as any },
      update: { w: weights as any },
    });
  }
}
