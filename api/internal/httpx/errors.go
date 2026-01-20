package httpx

import (
	"errors"
	"net/http"
)

type Error struct {
	Status  int
	Message string
	Cause   error
}

func (e Error) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Status != 0 {
		return http.StatusText(e.Status)
	}
	return "error"
}

func (e Error) Unwrap() error {
	return e.Cause
}

func (e Error) WithCause(err error) Error {
	e.Cause = err
	return e
}

func BadRequest(message string) Error {
	return Error{Status: http.StatusBadRequest, Message: message}
}

func Unauthorized(message string) Error {
	if message == "" {
		message = "Unauthorized"
	}
	return Error{Status: http.StatusUnauthorized, Message: message}
}

func Forbidden(message string) Error {
	if message == "" {
		message = "Forbidden"
	}
	return Error{Status: http.StatusForbidden, Message: message}
}

func NotFound(message string) Error {
	if message == "" {
		message = "Not found"
	}
	return Error{Status: http.StatusNotFound, Message: message}
}

func TooManyRequests(message string) Error {
	if message == "" {
		message = "Too many requests"
	}
	return Error{Status: http.StatusTooManyRequests, Message: message}
}

func InternalServerError(message string) Error {
	if message == "" {
		message = "Internal server error"
	}
	return Error{Status: http.StatusInternalServerError, Message: message}
}

func WriteError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	var httpErr Error
	if errors.As(err, &httpErr) {
		message := httpErr.Message
		if message == "" {
			message = http.StatusText(httpErr.Status)
		}
		WriteJSON(w, httpErr.Status, map[string]string{"error": message})
		return
	}
	WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Internal server error"})
}
