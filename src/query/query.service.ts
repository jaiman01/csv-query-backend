import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import * as Papa from 'papaparse';
import { Readable } from 'stream';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

@Injectable()
export class QueryService {
  private s3: S3Client;
  private bucket: string;
  private openai: OpenAI;
  private lambda: LambdaClient;

  constructor(private configService: ConfigService) {
    // AWS S3 setup (same as UploadService)
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

    this.bucket = this.configService.get<string>('AWS_BUCKET_NAME')!; // Add the ! here
    if (!this.bucket) {
      throw new Error('Missing AWS_S3_BUCKET_NAME in environment variables');
    }

    // OpenAI setup
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('Missing OPENAI_API_KEY in environment variables');
    }
    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });
    this.lambda = new LambdaClient({
      region: this.configService.get<string>('AWS_REGION')!,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        )!,
      },
    });
  }

  async processQuery(query: string, fileKey: string): Promise<any> {
    try {
      // 1. Retrieve CSV from S3
      const csvContent = await this.getCSVFromS3(fileKey);
      console.log('CSV content retrieved from S3:', csvContent);

      // 2. Parse CSV data
      const parsedData = await this.parseCSV(csvContent);
      console.log('Parsed data:', parsedData);

      // 3. Generate code with OpenAI
      const code = await this.generateCode(query, parsedData);
      console.log('Generated code:', code);

      // 4. Execute code (using a safe method -  Placeholder for Lambda invocation)
      const results = await this.executeCode(code, parsedData); // <--  Placeholder
      console.log('Execution results:', results);

      // 5.  Return results
      return results;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error; // Re-throw any HttpExceptions
      }
      throw new HttpException(
        'Error processing query',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async getCSVFromS3(fileKey: string): Promise<string> {
    try {
      const response = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        }),
      );

      if (!response.Body) {
        throw new HttpException(
          'File content is missing from S3 response',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      // Convert the body to a string.  The body can be a Readable, a Blob, or a Buffer.
      const stream = response.Body as Readable;

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      return buffer.toString('utf-8'); //
    } catch (error) {
      console.error('Error getting CSV from S3:', error);
      throw new HttpException(
        'Error retrieving CSV file from S3',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async parseCSV(csvString: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      Papa.parse(csvString, {
        header: true, //  Important:  Use header: true to get an array of objects
        complete: (results) => resolve(results.data),
        error: (error) => reject(error),
      });
    });
  }

  private async generateCode(query: string, data: any[]): Promise<string> {
    try {
      const dataStructurePrompt = `Here is the structure of the CSV data as a JSON array of objects: ${JSON.stringify(
        data.slice(0, 5),
      )}

Write Python code using the pandas library to answer the query: "${query}"

Guidelines:
- The data is stored in a variable named 'df'.
- Convert all necessary columns (e.g., numbers stored as strings) to appropriate types.
- When filtering data, check if the result is empty before accessing elements (e.g., use if/else or .empty check).
- Always assign the final result to a variable named 'result'.
- Do not include print statements, comments, or explanations.
- Return only valid, directly executable Python code.
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: dataStructurePrompt }],
      });

      const code = response.choices[0]?.message.content;
      if (!code) {
        throw new HttpException(
          'Failed to generate code from OpenAI',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const cleanedCode = code
        .replace(/```(?:python)?\n?([\s\S]*?)\n?```/, '$1')
        .trim();
      console.log('Sanitized code:\n', cleanedCode);
      return cleanedCode;
    } catch (error: any) {
      console.error(
        'Error calling OpenAI:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        'Error generating code with OpenAI',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  private async executeCode(code: string, data: any[]): Promise<any> {
    const lambdaFunctionName = this.configService.get<string>(
      'LAMBDA_FUNCTION_NAME',
    );
    if (!lambdaFunctionName) {
      throw new Error('Missing LAMBDA_FUNCTION_NAME in environment variables');
    }

    try {
      const command = new InvokeCommand({
        FunctionName: lambdaFunctionName,
        Payload: JSON.stringify({ code, data }), //  Include the 'data' here
      });

      const response = await this.lambda.send(command);

      if (response.FunctionError) {
        const payload = JSON.parse(Buffer.from(response.Payload!).toString());
        console.error('Lambda Function Error:', payload);
        throw new HttpException(
          `Lambda function execution error: ${payload.error || 'Unknown error'}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (!response.Payload) {
        throw new HttpException(
          'No payload received from Lambda function',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const payload = JSON.parse(Buffer.from(response.Payload!).toString());
      console.log('Lambda response parsed:', payload);

      //  The Lambda function returns a string, which might be JSON.
      let result;
      try {
        result = JSON.parse(payload.body);
      } catch (e) {
        result = payload.body; // If it's not JSON, just use the string
      }
      console.log('Processed result:', result);
      return result;
    } catch (error: any) {
      console.error('Error invoking Lambda function:', error);
      throw new HttpException(
        'Error invoking Lambda function',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
