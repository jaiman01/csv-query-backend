import { Module } from '@nestjs/common';
import { UploadService } from './uploads.service';
import { UploadController } from './uploads.controller';

@Module({
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService], // Exporting UploadService to be used in other modules
})
export class UploadModule {}
