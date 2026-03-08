import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
@Injectable()
export class UploadService {
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      endpoint: this.configService.get('AWS_ENDPOINT'),
      region: this.configService.getOrThrow('AWS_S3_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    });
  }

  public async uploadFile(
    file: Express.Multer.File,
    folder: string,
  ): Promise<string> {
    const fileName = `${folder}/${this.createRandomName()}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.configService.get('BUCKET_NAME'),
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return fileName;
  }

  public async deleteFile(path: string) {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.configService.get('BUCKET_NAME'),
        Key: path,
      }),
    );
  }

  public async getSignedLink(path: string) {
    //TODO: if gonna be new oauth
    if (path.startsWith('https://lh3.googleusercontent.com')) return path;

    const signingClient = new S3Client({
      region: this.configService.get('AWS_S3_REGION'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      },
      endpoint: this.configService.get('API_URL'),
      forcePathStyle: true,
    });

    const signedUrl = await getSignedUrl(
      signingClient,
      new GetObjectCommand({
        Bucket: this.configService.get('BUCKET_NAME'),
        Key: path,
      }),
      { expiresIn: 3600 },
    );

    return signedUrl;
  }

  private createRandomName() {
    return crypto.randomBytes(32).toString('hex');
  }
}
