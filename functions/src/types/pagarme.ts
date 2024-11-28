export interface PagarMeResponse {
  pix_qr_code: string;
  pix_qr_code_url: string;
  status: string;
  id: string;
}

export interface Phone {
  country_code: string;
  area_code: string;
  number: string;
}

export interface Customer {
  name: string;
  email: string;
  document: string;
  type: "individual" | "company";
  phones: {
    mobile_phone: Phone;
  };
}

export interface Item {
  amount: number;
  description: string;
  quantity: number;
}

export interface PixAdditionalInfo {
  name: string;
  value: string;
}

export interface PixPayment {
  payment_method: "pix";
  pix: {
    expires_in: number;
    additional_information?: PixAdditionalInfo[];
  };
}

export interface PagarMeRequest {
  items: Item[];
  customer: Customer;
  payments: PixPayment[];
}
