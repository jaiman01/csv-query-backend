import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadService {
  private s3: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const region = this.configService.get<string>('AWS_REGION');

    if (!accessKeyId || !secretAccessKey || !region) {
      throw new Error(
        'Missing AWS S3 credentials or region in environment variables',
      );
    }

    this.s3 = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const bucket = this.configService.get<string>('AWS_BUCKET_NAME');
    if (!bucket) {
      throw new Error('Missing AWS_S3_BUCKET_NAME in environment variables');
    }
    this.bucket = bucket;
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ url: string; key: string }> {
    const key = `${randomUUID()}-${file.originalname}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      console.log('File uploaded successfully:', key);

      return {
        url: `https://${this.bucket}.s3.${this.configService.get(
          'AWS_REGION',
        )}.amazonaws.com/${key}`,
        key,
      };
      console.log('File uploaded successfully:', key);
    } catch (error) {
      // Improved error handling:  Wrap the AWS SDK error with Nest's HttpException
      console.error('Error uploading to S3:', error);
      throw new HttpException(
        'Failed to upload file to S3',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
