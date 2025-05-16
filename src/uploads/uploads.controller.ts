import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './uploads.service';
import { Request } from 'express';
import { CsvFileValidationPipe } from './pipes/csv-file-validation.pipe';
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('csv') //  Specific route for CSV uploads
  @UseInterceptors(FileInterceptor('file')) // 'file' is the field name in the form-data
  async uploadCsv(
    @UploadedFile(CsvFileValidationPipe) file: Express.Multer.File,
    req: Request,
  ): Promise<{ url: string; key: string }> {
    console.log('File received:', file); //  Log the file for debugging
    //  Added file validation.  NestJS handles the errors and returns a 400 if the file doesn't meet the criteria.

    try {
      console.log('Mimetype received:', file.mimetype);
      console.log('Uploaded CSV File:', file);
      return await this.uploadService.uploadFile(file); //  Use the upload service
    } catch (error) {
      //  The UploadService should now throw HttpExceptions, but we still handle other potential errors
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`File upload failed: ${error.message}`);
    }
  }
}
