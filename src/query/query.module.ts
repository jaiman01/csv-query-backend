import { Module } from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryController } from './query.controller';
import { UploadModule } from '../uploads/uploads.module'; // Import UploadModule

@Module({
  imports: [UploadModule], // Import UploadModule to use UploadService
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
