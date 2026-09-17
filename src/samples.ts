import type { FieldMapping } from './domain/types'

export const sampleSoap = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <GetCustomersResponse>
      <Customers>
        <Customer>
          <CustomerNo>1001</CustomerNo>
          <Name>Kim</Name>
          <StatusCd>A</StatusCd>
          <Balance>12000</Balance>
          <Email xsi:nil="true" />
        </Customer>
        <Customer>
          <CustomerNo>1002</CustomerNo>
          <Name>Lee</Name>
          <StatusCd>I</StatusCd>
          <Balance>8000</Balance>
          <Email>lee@example.com</Email>
        </Customer>
        <Customer>
          <CustomerNo>1003</CustomerNo>
          <Name>Park</Name>
          <StatusCd>A</StatusCd>
          <Balance>5000</Balance>
          <Email>park@example.com</Email>
        </Customer>
      </Customers>
    </GetCustomersResponse>
  </soap:Body>
</soap:Envelope>`

export const sampleRest = `{
  "data": {
    "customers": [
      {
        "id": 1001,
        "fullName": "Kim",
        "status": "A",
        "account": { "balance": 12000 },
        "email": null
      },
      {
        "id": 1002,
        "fullName": "Lee Min",
        "status": "I",
        "account": { "balance": 8000 },
        "email": "lee@example.com"
      },
      {
        "id": 1004,
        "fullName": "Choi",
        "status": "A",
        "account": { "balance": 3000 },
        "email": "choi@example.com"
      }
    ]
  }
}`

export const sampleMappings: FieldMapping[] = [
  { id: 'customer-id', soapPath: 'Envelope.Body.GetCustomersResponse.Customers.Customer[0].CustomerNo', restPath: 'data.customers[0].id', displayName: 'Customer ID', comparison: 'text', include: true, joinKey: true },
  { id: 'name', soapPath: 'Envelope.Body.GetCustomersResponse.Customers.Customer[0].Name', restPath: 'data.customers[0].fullName', displayName: 'Customer name', comparison: 'exact', include: true, joinKey: false },
  { id: 'status', soapPath: 'Envelope.Body.GetCustomersResponse.Customers.Customer[0].StatusCd', restPath: 'data.customers[0].status', displayName: 'Status', comparison: 'exact', include: true, joinKey: false },
  { id: 'balance', soapPath: 'Envelope.Body.GetCustomersResponse.Customers.Customer[0].Balance', restPath: 'data.customers[0].account.balance', displayName: 'Balance', comparison: 'number', include: true, joinKey: false },
  { id: 'email', soapPath: 'Envelope.Body.GetCustomersResponse.Customers.Customer[0].Email', restPath: 'data.customers[0].email', displayName: 'Email', comparison: 'exact', include: true, joinKey: false },
]
