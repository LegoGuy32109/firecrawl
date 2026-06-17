import { Response } from "express";
import { z } from "zod";
import {
  EndpointFeedbackRequest,
  EndpointFeedbackResponse,
  RequestWithAuth,
  endpointFeedbackSchema,
} from "../types";
import { errorResponse } from "../response-enveloper";
import { RequestError } from "../../../lib/error-codes";
import { recordEndpointFeedback } from "./record";
import { endpointFeedbackRecordOptions } from "./record-options";
import { toFeedbackInput } from "./request-input";

export async function feedbackController(
  req: RequestWithAuth<{}, EndpointFeedbackResponse, EndpointFeedbackRequest>,
  res: Response<EndpointFeedbackResponse>,
) {
  let parsedBody: EndpointFeedbackRequest;
  try {
    parsedBody = endpointFeedbackSchema.parse(req.body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const envelope = errorResponse(
        RequestError.BAD_REQUEST,
        "Invalid request body",
        req,
        {
          details: error.issues as any,
        },
      );
      return res.status(envelope.httpStatus).json({
        ...envelope.body,
        feedbackErrorCode: "INVALID_BODY",
      });
    }
    throw error;
  }

  const result = await recordEndpointFeedback(
    req,
    endpointFeedbackRecordOptions({
      endpoint: parsedBody.endpoint,
      jobId: parsedBody.jobId,
      feedback: toFeedbackInput(parsedBody),
    }),
  );

  return res
    .status(result.status)
    .json(result.body as EndpointFeedbackResponse);
}
