// Copied into the pinned upstream gateway module by prepare-gateway.cjs.
package main

import (
 "bytes"
 "encoding/json"
 "fmt"
 "io"
 "mime/multipart"
 "net/http"
 "os"
 "path/filepath"
 "time"
 "github.com/DictionLabs/Diction/gateway/pairing"
 qrcode "github.com/skip2/go-qrcode"
)

func main() {
 if err := run(); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
}
func run() error {
 if len(os.Args) != 2 { return fmt.Errorf("usage: diction-pairqr <output.png>") }
 ks,err:=pairing.KeyStoreFromEnv(pairing.ModeRequired); if err!=nil{return err}
 token,err:=ks.IssueToken();if err!=nil{return err}
 publicURL:=os.Getenv("PUBLIC_URL");if publicURL==""{return fmt.Errorf("PUBLIC_URL is required")}
 // Test the same credential and HTTPS endpoint encoded in the QR, without logging it.
 client:=&http.Client{Timeout:180*time.Second}
 req,_:=http.NewRequest("GET",publicURL+"/v1/auth/key",nil)
 req.Header.Set("Authorization","Bearer "+token)
 res,err:=client.Do(req);if err!=nil{return fmt.Errorf("pairing endpoint: %w",err)}
 io.Copy(io.Discard,res.Body);res.Body.Close()
 if res.StatusCode!=200{return fmt.Errorf("pairing endpoint returned %d",res.StatusCode)}
 if audio:=os.Getenv("DICTION_TEST_AUDIO");audio!=""{
  var body bytes.Buffer
  form:=multipart.NewWriter(&body)
  file,err:=os.Open(audio);if err!=nil{return err}
  field,err:=form.CreateFormFile("file",filepath.Base(audio));if err!=nil{file.Close();return err}
  _,err=io.Copy(field,file);file.Close();if err!=nil{return err}
  form.WriteField("model","custom");form.WriteField("language","en");form.WriteField("response_format","json");form.Close()
  req,_=http.NewRequest("POST",publicURL+"/v1/audio/transcriptions",&body)
  req.Header.Set("Authorization","Bearer "+token);req.Header.Set("Content-Type",form.FormDataContentType())
  res,err=client.Do(req);if err!=nil{return fmt.Errorf("transcription request: %w",err)}
  defer res.Body.Close()
  if res.StatusCode!=200{return fmt.Errorf("transcription returned %d",res.StatusCode)}
  var result struct{Text string `json:"text"`}
  if err=json.NewDecoder(res.Body).Decode(&result);err!=nil{return err}
  if result.Text==""{return fmt.Errorf("empty transcription")}
  fmt.Printf("Synthetic speech test passed through Tailscale HTTPS: %s\n",result.Text)
 }
 if err=qrcode.WriteFile(pairing.Link(publicURL,token),qrcode.Medium,640,os.Args[1]);err!=nil{return err}
 fmt.Println("Pairing QR created; credentials were not printed.")
 return nil
}
