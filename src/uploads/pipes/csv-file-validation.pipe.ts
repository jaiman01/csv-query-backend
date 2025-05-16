import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';

@Injectable()
export class CsvFileValidationPipe implements PipeTransform {
  transform(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const acceptedTypes = ['text/csv', 'application/vnd.ms-excel'];
    console.log('CSV Validation Pipe: Received mimetype =>', file.mimetype);

    if (!acceptedTypes.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    return file;
  }
}
