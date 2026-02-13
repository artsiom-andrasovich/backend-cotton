import { MIN_AMOUNT_OF_RECORDS_TO_TRAIN } from '@app/common/constants';
import { exportCategoryLogsToCsv } from '@app/common/utils';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class WeightsService {
  private readonly logger = new Logger(WeightsService.name);

  constructor(
    private prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async trainCategory(categoryId: string) {
    const scriptPath = this.configService.get('PYTHON_SCRIPT_PATH');
    const rootDir = process.cwd();
    const pyScript = path.join(rootDir, scriptPath);
    const tempDir = path.join(rootDir, 'temp');
    const csvFile = path.join(tempDir, `train_${categoryId}_${Date.now()}.csv`);

    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    try {
      const logsCount = await this.prismaService.fSRSCardLog.count({
        where: {
          fsrsCard: {
            card: { deck: { deckCategoryId: categoryId } },
          },
        },
      });
      if (logsCount < MIN_AMOUNT_OF_RECORDS_TO_TRAIN) {
        this.logger.debug(`Skip category ${categoryId}: not enough logs .`);
        return;
      }
      await exportCategoryLogsToCsv(this.prismaService, categoryId, csvFile);

      const newWeights = await this.runPythonScript(pyScript, csvFile);

      if (newWeights && newWeights.length === 17) {
        // Save weights to DB
        await this.saveWeights(categoryId, newWeights);
        this.logger.log(`Weights are updated${categoryId}`);
      } else {
        this.logger.warn(`Python doesnt return correct weights${categoryId}`);
      }
    } catch (error) {
      this.logger.error(
        `Error of trainig category ${categoryId}: ${error.message}`,
        error.stack,
      );
    } finally {
      if (fs.existsSync(csvFile)) {
        try {
          fs.unlinkSync(csvFile);
        } catch (e) {
          this.logger.error(`Failed to delete file ${csvFile}`);
        }
      }
    }
  }

  // Starts py script
  private async runPythonScript(
    scriptPath: string,
    csvPath: string,
  ): Promise<number[] | null> {
    return new Promise((resolve, reject) => {
      const pythonPath = this.configService.get('PYTHON_EXECUTABLE');
      const pyProccess = spawn(pythonPath, [scriptPath, csvPath], {
        cwd: './temp',
      });

      let stdoutData = '';
      let stderrData = '';

      pyProccess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pyProccess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pyProccess.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`Python process error code ${code}: ${stderrData}`);
          return resolve(null);
        }

        try {
          const jsonMatch = stdoutData.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            this.logger.error(`No JSON found in output. Raw: ${stdoutData}`);
            return reject(new Error('Invalid output format'));
          }
          const result = JSON.parse(jsonMatch[0]);
          if (result.success && Array.isArray(result.weights)) {
            resolve(result.weights);
          } else {
            this.logger.warn(
              `Python returned logic error: ${result.message || result.error}`,
            );
            resolve(null);
          }
        } catch (e) {
          this.logger.error(
            `Failed to parse Python JSON. Raw output: ${stdoutData}`,
          );
          resolve(null);
        }
      });
    });
  }

  private async saveWeights(categoryId: string, weights: number[]) {
    await this.prismaService.fSRSWeights.upsert({
      where: { categoryId },
      create: {
        categoryId,
        w: weights as any,
      },
      update: {
        w: weights as any,
      },
    });
  }
}
