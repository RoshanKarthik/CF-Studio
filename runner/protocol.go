package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
)

// Chrome native messaging: each message is a 32-bit length in native byte order (little-endian
// on every platform Chrome supports) followed by that many bytes of UTF-8 JSON.
const (
	maxIncoming = 64 << 20 // Chrome → host limit
	maxOutgoing = 1 << 20  // host → Chrome limit
)

var errTooLarge = errors.New("message too large")

func readMessage(r io.Reader) ([]byte, error) {
	var n uint32
	if err := binary.Read(r, binary.LittleEndian, &n); err != nil {
		return nil, err // io.EOF when Chrome closes the port
	}
	if n > maxIncoming {
		return nil, fmt.Errorf("%w: %d bytes", errTooLarge, n)
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}

// messageWriter serializes concurrent sends onto the one stdout stream.
type messageWriter struct {
	mu sync.Mutex
	w  io.Writer
}

func (m *messageWriter) send(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if len(b) > maxOutgoing {
		return fmt.Errorf("%w: %d bytes", errTooLarge, len(b))
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if err := binary.Write(m.w, binary.LittleEndian, uint32(len(b))); err != nil {
		return err
	}
	_, err = m.w.Write(b)
	return err
}
