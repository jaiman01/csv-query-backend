import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { QueryService } from './query.service'; // Import the QueryService
import { UploadService } from '../uploads/uploads.service'; // Import UploadService
import { Request } from 'express';

interface QueryRequest {
  query: string;
  fileKey: string; // The key of the uploaded CSV file in S3
}

@Controller('query')
export class QueryController {
  constructor(
    private readonly queryService: QueryService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  async handleQuery(@Body() queryRequest: QueryRequest): Promise<any> {
    console.log('Received query request:', queryRequest); // Log the request for debugging
    const { query, fileKey } = queryRequest;

    if (!query || !fileKey) {
      throw new HttpException(
        'Both query and fileKey are required.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const results = await this.queryService.processQuery(query, fileKey);
      return { results };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to process query.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
